import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const appDir = path.resolve(rootDir, "..", "royal_fitness_app");

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.VITE_ADMIN_EMAIL;
const adminPassword = process.env.VITE_ADMIN_PASSWORD;

if (!supabaseUrl || (!supabaseAnonKey && !serviceRoleKey)) {
  throw new Error("Missing VITE_SUPABASE_URL and auth key (VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY).");
}
const supabase = createClient(supabaseUrl, serviceRoleKey ?? supabaseAnonKey);

const levelFromInstructions = (length) => {
  if (length <= 4) return "workout_level_beginner";
  if (length <= 6) return "workout_level_intermediate";
  return "workout_level_advanced";
};

const estimateCalories = (bodyPart = "", target = "") => {
  const b = bodyPart.toLowerCase();
  const t = target.toLowerCase();
  if (b.includes("legs") || t.includes("glutes")) return 240;
  if (b.includes("back") || b.includes("chest")) return 220;
  if (b.includes("waist") || t.includes("abs")) return 170;
  if (b.includes("arms") || t.includes("biceps")) return 160;
  if (b.includes("cardio")) return 260;
  return 190;
};

const arabicName = (english) => {
  const map = new Map([
    ["hack calf raise", "رفع سمانة على جهاز الهاك"],
    ["sled 45° leg press (side pov)", "ضغط أرجل 45° على السليد (جانبي)"],
    ["dumbbell front raise", "رفع أمامي بالدمبل"],
    ["dumbbell over bench revers wrist curl", "ثني معصم عكسي بالدمبل فوق البنش"],
    ["barbell incline bench press", "بنش مائل بالبار"],
    ["cable squatting curl", "كرل سكوات بالكابل"],
    ["dumbbell one arm hammer preacher curl", "هامر كرل ذراع واحدة على بريتشر"],
    ["barbell standing close grip curl", "كرل بار بقبضة ضيقة واقف"],
    ["kettlebell pistol squat", "سكوات مسدس بالكيتل بيل"],
    ["impossible dips", "ديبس صعب"],
  ]);
  return map.get(String(english).toLowerCase()) ?? english;
};

async function run() {
  if (!serviceRoleKey) {
    if (!adminEmail || !adminPassword) {
      throw new Error("Missing VITE_ADMIN_EMAIL or VITE_ADMIN_PASSWORD in environment.");
    }
    const authResp = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
    if (authResp.error) {
      throw new Error(`Admin login failed: ${authResp.error.message}`);
    }
  }

  const jsonPath = path.join(appDir, "assets", "exercisedb_v1_sample", "exercises.json");
  const gifsDir = path.join(appDir, "assets", "exercisedb_v1_sample", "gifs_360x360");
  const raw = await readFile(jsonPath, "utf-8");
  const list = JSON.parse(raw);

  let uploaded = 0;
  for (const item of list) {
    const exerciseId = String(item.exerciseId ?? "");
    const name = String(item.name ?? "Workout");
    const gifName = String(item.gifUrl ?? "");
    const instructions = Array.isArray(item.instructions) ? item.instructions.map(String) : [];
    const bodyPart = Array.isArray(item.bodyParts) && item.bodyParts[0] ? String(item.bodyParts[0]) : "";
    const target = Array.isArray(item.targetMuscles) && item.targetMuscles[0] ? String(item.targetMuscles[0]) : "";
    const equipment = Array.isArray(item.equipments) && item.equipments[0] ? String(item.equipments[0]) : "";
    const type = equipment.toLowerCase() === "body weight" || bodyPart.toLowerCase() === "cardio" ? "home" : "gym";

    let imageUrl = null;
    if (gifName) {
      try {
        const filePath = path.join(gifsDir, gifName);
        const fileBuffer = await readFile(filePath);
        const storagePath = `raw/${gifName}`;
        const uploadResp = await supabase.storage
          .from("exercise-gifs")
          .upload(storagePath, fileBuffer, { upsert: true, contentType: "image/gif" });
        if (uploadResp.error) {
          throw uploadResp.error;
        }
        const { data } = supabase.storage.from("exercise-gifs").getPublicUrl(storagePath);
        imageUrl = data.publicUrl;
      } catch (err) {
        console.warn(`GIF upload failed for ${gifName}:`, err.message);
      }
    }

    const minutes = Math.max(8, Math.min(35, instructions.length * 2));
    const calories = estimateCalories(bodyPart, target);
    const rating = Number((4 + ((exerciseId ? exerciseId.charCodeAt(0) : 3) % 10) / 10).toFixed(1));

    const row = {
      legacy_id: exerciseId,
      name,
      name_ar: arabicName(name),
      type,
      target,
      equipment,
      level: levelFromInstructions(instructions.length),
      minutes,
      calories,
      image_asset_path: imageUrl,
      exercise_steps: instructions.length,
      rating,
      instructions,
      source: "bulk_sync",
    };

    const upsertResp = await supabase
      .from("exercises")
      .upsert(row, { onConflict: "legacy_id" });
    if (upsertResp.error) {
      console.warn(`Upsert failed for ${exerciseId}: ${upsertResp.error.message}`);
      continue;
    }
    uploaded += 1;
  }

  console.log(`Done. Synced exercises: ${uploaded}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
