import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Edit3, Trash2, Eye, ChevronDown, Filter } from "lucide-react";
import { useLang } from "./LanguageContext";
import { db, ensureAdminAuth, hasFirebaseConfig } from "../firebase";

const exercisesFallback = {
  ar: [
    { id: 1, name: "ضغط البنش بالبار", target: "الصدر", difficulty: "متوسط", equipment: "بار حديدي", source: "يدوي", gif: "🏋️" },
    { id: 2, name: "سحب علوي", target: "الظهر", difficulty: "مبتدئ", equipment: "كابل", source: "RapidAPI", gif: "💪" },
    { id: 3, name: "سكوات", target: "الأرجل", difficulty: "متقدم", equipment: "بار حديدي", source: "يدوي", gif: "🦵" },
    { id: 4, name: "تبادل دمبل", target: "البايسبس", difficulty: "مبتدئ", equipment: "دمبل", source: "RapidAPI", gif: "💪" },
    { id: 5, name: "ضغط كتف علوي", target: "الأكتاف", difficulty: "متوسط", equipment: "بار حديدي", source: "يدوي", gif: "🏋️" },
    { id: 6, name: "ديدلفت", target: "الظهر", difficulty: "متقدم", equipment: "بار حديدي", source: "يدوي", gif: "🏋️" },
    { id: 7, name: "تفتيح كابل", target: "الصدر", difficulty: "متوسط", equipment: "كابل", source: "RapidAPI", gif: "💪" },
    { id: 8, name: "ضغط أرجل", target: "الأرجل", difficulty: "مبتدئ", equipment: "آلة", source: "يدوي", gif: "🦵" },
    { id: 9, name: "ترايسبس بالكابل", target: "الترايسبس", difficulty: "مبتدئ", equipment: "كابل", source: "RapidAPI", gif: "💪" },
    { id: 10, name: "ديدلفت روماني", target: "العضلة الخلفية", difficulty: "متوسط", equipment: "بار حديدي", source: "يدوي", gif: "🏋️" },
  ],
  en: [
    { id: 1, name: "Barbell Bench Press", target: "Chest", difficulty: "Intermediate", equipment: "Barbell", source: "Manual", gif: "🏋️" },
    { id: 2, name: "Lat Pulldown", target: "Back", difficulty: "Beginner", equipment: "Cable", source: "RapidAPI", gif: "💪" },
    { id: 3, name: "Squat", target: "Legs", difficulty: "Advanced", equipment: "Barbell", source: "Manual", gif: "🦵" },
    { id: 4, name: "Dumbbell Curl", target: "Biceps", difficulty: "Beginner", equipment: "Dumbbell", source: "RapidAPI", gif: "💪" },
    { id: 5, name: "Overhead Press", target: "Shoulders", difficulty: "Intermediate", equipment: "Barbell", source: "Manual", gif: "🏋️" },
    { id: 6, name: "Deadlift", target: "Back", difficulty: "Advanced", equipment: "Barbell", source: "Manual", gif: "🏋️" },
    { id: 7, name: "Cable Fly", target: "Chest", difficulty: "Intermediate", equipment: "Cable", source: "RapidAPI", gif: "💪" },
    { id: 8, name: "Leg Press", target: "Legs", difficulty: "Beginner", equipment: "Machine", source: "Manual", gif: "🦵" },
    { id: 9, name: "Tricep Pushdown", target: "Triceps", difficulty: "Beginner", equipment: "Cable", source: "RapidAPI", gif: "💪" },
    { id: 10, name: "Romanian Deadlift", target: "Hamstrings", difficulty: "Intermediate", equipment: "Barbell", source: "Manual", gif: "🏋️" },
  ],
};

const filtersData = {
  ar: {
    all: "الكل",
    target: ["الكل", "الصدر", "الظهر", "الأرجل", "البايسبس", "الترايسبس", "الأكتاف", "العضلة الخلفية"],
    equipment: ["الكل", "بار حديدي", "دمبل", "كابل", "آلة", "وزن الجسم"],
    difficulty: ["الكل", "مبتدئ", "متوسط", "متقدم"],
    source: ["الكل", "يدوي", "RapidAPI"],
    diffColors: { "مبتدئ": "bg-emerald-500/10 text-emerald-400", "متوسط": "bg-[#D4AF37]/10 text-[#D4AF37]", "متقدم": "bg-red-500/10 text-red-400" },
  },
  en: {
    all: "All",
    target: ["All", "Chest", "Back", "Legs", "Biceps", "Triceps", "Shoulders", "Hamstrings"],
    equipment: ["All", "Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight"],
    difficulty: ["All", "Beginner", "Intermediate", "Advanced"],
    source: ["All", "Manual", "RapidAPI"],
    diffColors: { "Beginner": "bg-emerald-500/10 text-emerald-400", "Intermediate": "bg-[#D4AF37]/10 text-[#D4AF37]", "Advanced": "bg-red-500/10 text-red-400" },
  },
};

type ExerciseItem = {
  id: string | number;
  name: string;
  target: string;
  difficulty: string;
  equipment: string;
  source: string;
  gif: string;
  gifUrl?: string;
  mediaType?: "image" | "video";
  audioUrl?: string;
};

function FilterSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-secondary border border-border rounded-lg px-3 py-2 pe-8 text-foreground focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40 cursor-pointer"
        style={{ fontSize: 13 }}
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-card">{label}: {o}</option>
        ))}
      </select>
      <ChevronDown className="absolute end-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}

export function ExerciseManagement() {
  const { lang, t } = useLang();
  const fd = filtersData[lang];
  const [exercises, setExercises] = useState<ExerciseItem[]>(exercisesFallback[lang]);
  const canUseFirebase = Boolean(db && hasFirebaseConfig);

  const [filters, setFilters] = useState({ target: fd.all, equipment: fd.all, difficulty: fd.all, source: fd.all });
  const [search, setSearch] = useState("");
  const [live, setLive] = useState(false);
  const [pendingId, setPendingId] = useState<string | number | null>(null);
  const [busyUpload, setBusyUpload] = useState(false);
  const maxMediaSize = 10 * 1024 * 1024;

  useEffect(() => {
    if (!db || !hasFirebaseConfig) {
      setExercises(exercisesFallback[lang]);
      setLive(false);
      return;
    }
    let channel: ReturnType<typeof db.channel> | null = null;
    let cancelled = false;

    const loadExercises = async () => {
      if (!db) return;
      const resp = await db.from("exercises").select("*").order("name", { ascending: true });
      const rows = resp.data ?? [];
      const mapped = rows.map((data, idx) => {
        const diff = data.level?.toString() ?? data.difficulty?.toString() ?? (lang === "ar" ? "مبتدئ" : "Beginner");
        return {
          id: data.id || idx,
          name: lang === "ar" ? (data.name_ar?.toString() ?? data.name?.toString() ?? "تمرين") : (data.name?.toString() ?? data.name_ar?.toString() ?? "Exercise"),
          target: data.target?.toString() ?? data.body_part?.toString() ?? (lang === "ar" ? "الكل" : "All"),
          difficulty: diff,
          equipment: data.equipment?.toString() ?? (lang === "ar" ? "وزن الجسم" : "Bodyweight"),
          source: data.source?.toString() ?? "App",
          gif: "🏋️",
          gifUrl: data.media_url?.toString() ?? data.image_asset_path?.toString(),
          mediaType: (data.media_type?.toString() === "video" ? "video" : "image"),
          audioUrl: data.audio_url?.toString(),
        };
      });
      setExercises(mapped.length ? mapped : exercisesFallback[lang]);
      setLive(mapped.length > 0);
    };

    ensureAdminAuth().then((authed) => {
      if (!authed || cancelled) {
        setExercises(exercisesFallback[lang]);
        setLive(false);
        return;
      }
      loadExercises();
      channel = db
        .channel("exercises-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "exercises" },
          () => loadExercises(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) db.removeChannel(channel);
    };
  }, [lang]);

  // Reset filters on language change handled by using fd.all as default comparisons
  const filtered = useMemo(() => exercises.filter((e) => {
    if (filters.target !== fd.all && e.target !== filters.target) return false;
    if (filters.equipment !== fd.all && e.equipment !== filters.equipment) return false;
    if (filters.difficulty !== fd.all && e.difficulty !== filters.difficulty) return false;
    if (filters.source !== fd.all && e.source !== filters.source) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [exercises, fd.all, filters.difficulty, filters.equipment, filters.source, filters.target, search]);

  const headers = lang === "ar"
    ? ["الصورة", "اسم التمرين", "العضلة المستهدفة", "المستوى", "الأدوات", "المصدر", "الإجراءات"]
    : ["GIF", "Name", "Target Muscle", "Difficulty", "Equipment", "Source", "Actions"];

  const createExerciseInput = (seed?: ExerciseItem) => {
    const defaultName = seed?.name ?? "";
    const defaultTarget = seed?.target ?? (lang === "ar" ? "الصدر" : "Chest");
    const defaultEquipment = seed?.equipment ?? (lang === "ar" ? "وزن الجسم" : "Bodyweight");
    const defaultDifficulty = seed?.difficulty ?? fd.difficulty[1];
    const defaultGifUrl = seed?.gifUrl ?? "";
    const defaultAudioUrl = seed?.audioUrl ?? "";
    const name = window.prompt(t("اسم التمرين", "Exercise name"), defaultName);
    if (!name || !name.trim()) return null;

    const target = window.prompt(t("العضلة المستهدفة", "Target muscle"), defaultTarget) || defaultTarget;
    const equipment = window.prompt(t("الأدوات", "Equipment"), defaultEquipment) || defaultEquipment;
    const difficulty = window.prompt(t("المستوى", "Difficulty"), defaultDifficulty) || defaultDifficulty;
    const gifUrl = window.prompt(t("رابط ملف GIF", "GIF URL"), defaultGifUrl) || defaultGifUrl;
    const audioUrl = window.prompt(t("رابط شرح صوتي (اختياري)", "Audio explanation URL (optional)"), defaultAudioUrl) || defaultAudioUrl;
    return {
      name: name.trim(),
      target: target.trim(),
      equipment: equipment.trim(),
      difficulty: difficulty.trim(),
      gifUrl: gifUrl.trim(),
      audioUrl: audioUrl.trim(),
    };
  };

  const pickFile = (accept: string): Promise<File | null> =>
    new Promise((resolve) => {
      if (typeof window === "undefined") return resolve(null);
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });

  const uploadFile = async (file: File, folder: "media" | "audio") => {
    if (!db) return null;
    if (file.size > maxMediaSize) {
      window.alert(t("حجم الملف يجب ألا يتجاوز 10 ميجا", "File size must be <= 10MB"));
      return null;
    }
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const resp = await db.storage.from("exercise-media").upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (resp.error) {
      window.alert(resp.error.message);
      return null;
    }
    const { data } = db.storage.from("exercise-media").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleAddExercise = async () => {
    if (typeof window === "undefined") return;
    const input = createExerciseInput();
    if (!input) return;

    if (!canUseFirebase || !db) {
      const localExercise: ExerciseItem = {
        id: `local-${Date.now()}`,
        name: input.name,
        target: input.target,
        equipment: input.equipment,
        difficulty: input.difficulty,
        source: lang === "ar" ? "يدوي" : "Manual",
        gif: "🏋️",
        gifUrl: input.gifUrl,
      };
      setExercises((prev) => [localExercise, ...prev]);
      return;
    }

    await ensureAdminAuth();
    setBusyUpload(true);
    let mediaUrl = input.gifUrl || null;
    let mediaType: "image" | "video" = "image";
    let audioUrl = input.audioUrl || null;
    try {
      const mediaFile = await pickFile("image/*,video/*");
      if (mediaFile) {
        mediaType = mediaFile.type.startsWith("video/") ? "video" : "image";
        mediaUrl = await uploadFile(mediaFile, "media");
      }
      const audioFile = await pickFile("audio/*");
      if (audioFile) {
        audioUrl = await uploadFile(audioFile, "audio");
      }
    } finally {
      setBusyUpload(false);
    }
    await db.from("exercises").insert({
      name: input.name,
      name_ar: input.name,
      target: input.target,
      equipment: input.equipment,
      level: input.difficulty,
      image_asset_path: mediaUrl,
      media_url: mediaUrl,
      media_type: mediaType,
      audio_url: audioUrl,
      source: "Admin",
    });
  };

  const handleEditExercise = async (exercise: ExerciseItem) => {
    if (typeof window === "undefined") return;
    const input = createExerciseInput(exercise);
    if (!input) return;

    if (!canUseFirebase || !db || typeof exercise.id !== "string") {
      setExercises((prev) =>
        prev.map((item) => (item.id === exercise.id ? { ...item, ...input } : item)),
      );
      return;
    }

    try {
      setPendingId(exercise.id);
      await ensureAdminAuth();
      setBusyUpload(true);
      let mediaUrl = input.gifUrl || exercise.gifUrl || null;
      let mediaType: "image" | "video" = exercise.mediaType ?? "image";
      let audioUrl = input.audioUrl || exercise.audioUrl || null;
      const mediaFile = await pickFile("image/*,video/*");
      if (mediaFile) {
        mediaType = mediaFile.type.startsWith("video/") ? "video" : "image";
        mediaUrl = await uploadFile(mediaFile, "media");
      }
      const audioFile = await pickFile("audio/*");
      if (audioFile) {
        audioUrl = await uploadFile(audioFile, "audio");
      }
      await db.from("exercises").update({
        name: input.name,
        name_ar: input.name,
        target: input.target,
        equipment: input.equipment,
        level: input.difficulty,
        image_asset_path: mediaUrl,
        media_url: mediaUrl,
        media_type: mediaType,
        audio_url: audioUrl,
      }).eq("id", exercise.id);
    } finally {
      setBusyUpload(false);
      setPendingId(null);
    }
  };

  const handleDeleteExercise = async (exercise: ExerciseItem) => {
    if (typeof window === "undefined") return;
    const confirmDelete = window.confirm(
      t("هل تريد حذف هذا التمرين؟", "Are you sure you want to delete this exercise?"),
    );
    if (!confirmDelete) return;

    if (!canUseFirebase || !db || typeof exercise.id !== "string") {
      setExercises((prev) => prev.filter((item) => item.id !== exercise.id));
      return;
    }

    try {
      setPendingId(exercise.id);
      await ensureAdminAuth();
      await db.from("exercises").delete().eq("id", exercise.id);
    } finally {
      setPendingId(null);
    }
  };

  const handleViewExercise = (exercise: ExerciseItem) => {
    if (typeof window === "undefined") return;
    window.alert(
      `${t("الاسم", "Name")}: ${exercise.name}\n${t("العضلة", "Target")}: ${exercise.target}\n${t("المستوى", "Difficulty")}: ${exercise.difficulty}\n${t("الأدوات", "Equipment")}: ${exercise.equipment}`,
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#F5EAD4]">{t("إدارة التمارين", "Exercise Management")}</h1>
          <p className="text-muted-foreground" style={{ fontSize: 14 }}>
            {t(`إدارة مكتبة التمارين الخاصة بك (${exercises.length} تمرين)`, `Manage your exercise library (${exercises.length} exercises)`)} ·{" "}
            <span className={live ? "text-emerald-400" : "text-amber-400"}>
              {live ? t("مربوط ببيانات التطبيق", "Synced with app data") : t("وضع تجريبي محلي", "Local demo mode")}
            </span>
            {busyUpload ? ` · ${t("جارٍ رفع الميديا...", "Uploading media...")}` : ""}
          </p>
        </div>
        <button
          onClick={handleAddExercise}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#D4AF37] text-[#012217] hover:bg-[#c9a430] transition-colors shadow-[0_0_20px_rgba(212,175,55,0.15)] cursor-pointer"
          style={{ fontSize: 14, fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" />
          {t("إضافة تمرين جديد", "Add New Exercise")}
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card flex-wrap">
        <Filter className="w-4 h-4 text-[#D4AF37]" />
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("ابحث عن تمرين...", "Search exercises...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full ps-9 pe-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
            style={{ fontSize: 13 }}
          />
        </div>
        <FilterSelect label={t("العضلة", "Target")} options={fd.target} value={filters.target} onChange={(v) => setFilters({ ...filters, target: v })} />
        <FilterSelect label={t("الأدوات", "Equipment")} options={fd.equipment} value={filters.equipment} onChange={(v) => setFilters({ ...filters, equipment: v })} />
        <FilterSelect label={t("المستوى", "Difficulty")} options={fd.difficulty} value={filters.difficulty} onChange={(v) => setFilters({ ...filters, difficulty: v })} />
        <FilterSelect label={t("المصدر", "Source")} options={fd.source} value={filters.source} onChange={(v) => setFilters({ ...filters, source: v })} />
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {headers.map((h) => (
                <th key={h} className="px-4 py-3 text-start text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b border-border/50 hover:bg-[#D4AF37]/[0.03] transition-colors group">
                <td className="px-4 py-3">
                  {e.gifUrl && e.mediaType !== "video" ? (
                    <img src={e.gifUrl} alt={e.name} className="w-10 h-10 rounded-lg object-cover border border-border bg-secondary" />
                  ) : e.gifUrl && e.mediaType === "video" ? (
                    <video src={e.gifUrl} className="w-10 h-10 rounded-lg object-cover border border-border bg-secondary" muted />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center" style={{ fontSize: 20 }}>
                      {e.gif}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-[#F5EAD4]" style={{ fontSize: 13, fontWeight: 500 }}>{e.name}</td>
                <td className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>{e.target}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full ${(fd.diffColors as any)[e.difficulty] || ""}`} style={{ fontSize: 11 }}>{e.difficulty}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>{e.equipment}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full ${e.source === "RapidAPI" ? "bg-blue-500/10 text-blue-400" : "bg-secondary text-muted-foreground"}`} style={{ fontSize: 11 }}>{e.source}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleViewExercise(e)}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-[#D4AF37] transition-colors cursor-pointer"
                      title={t("عرض", "View")}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEditExercise(e)}
                      disabled={pendingId === e.id}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-[#D4AF37] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={t("تعديل", "Edit")}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteExercise(e)}
                      disabled={pendingId === e.id}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={t("حذف", "Delete")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground" style={{ fontSize: 14 }}>
            {t("لا توجد تمارين تطابق الفلاتر الحالية.", "No exercises match the current filters.")}
          </div>
        )}
      </div>
    </div>
  );
}
