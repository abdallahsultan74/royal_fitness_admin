import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Edit3, Trash2, Eye, ChevronDown, Filter, Upload, Mic, Square, Play, Pause, Trash } from "lucide-react";
import { useSearchParams } from "react-router";
import { useLang } from "./LanguageContext";
import { db, ensureStaffAuth, hasFirebaseConfig } from "../firebase";
import { adminDelivery } from "../buildConfig";
import { bilingualOptionMatches, normalizeForSearch, textMatchesQuery } from "../searchUtils";

function parseYouTubeId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id ? id.trim() : null;
    }
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v.trim();
      const parts = u.pathname.split("/").filter(Boolean);
      // /shorts/<id>, /embed/<id>
      const idx = parts.findIndex((p) => p === "shorts" || p === "embed" || p === "v");
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1]!.trim();
    }
    return null;
  } catch {
    return null;
  }
}

function parseVimeoId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host.endsWith("vimeo.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    // vimeo.com/<id> or vimeo.com/video/<id>
    const id = parts[0] === "video" ? parts[1] : parts[0];
    if (!id) return null;
    return /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function isDirectVideoUrl(rawUrl: string): boolean {
  const s = rawUrl.trim().toLowerCase();
  return (
    s.endsWith(".mp4") ||
    s.endsWith(".webm") ||
    s.endsWith(".mov") ||
    s.endsWith(".m3u8") ||
    s.includes(".mp4?") ||
    s.includes(".webm?") ||
    s.includes(".mov?") ||
    s.includes(".m3u8?")
  );
}

function normalizeMediaUrl(rawUrl: string): string {
  const s = rawUrl.trim();
  if (!s) return "";
  // Accept scheme-less links pasted by admins (e.g. "youtu.be/...", "www.youtube.com/...")
  if (/^https?:\/\//i.test(s)) return s;
  if (/^(www\.)/i.test(s)) return `https://${s}`;
  if (/^(youtu\.be\/|youtube\.com\/)/i.test(s)) return `https://${s}`;
  if (/^(vimeo\.com\/)/i.test(s)) return `https://${s}`;
  return s;
}

function looksLikeVideoLink(rawUrl: string): boolean {
  const s = rawUrl.trim().toLowerCase();
  if (!s) return false;
  if (s.includes("youtube.com") || s.includes("youtu.be") || s.includes("vimeo.com")) return true;
  return isDirectVideoUrl(s);
}

function videoThumbUrl(rawUrl: string): string | null {
  const yt = parseYouTubeId(rawUrl);
  if (yt) return `https://img.youtube.com/vi/${yt}/hqdefault.jpg`;
  const vimeo = parseVimeoId(rawUrl);
  // vumbnail is a lightweight public thumbnail proxy for Vimeo IDs.
  if (vimeo) return `https://vumbnail.com/${vimeo}.jpg`;
  return null;
}

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
    creator: ["الكل", "المدرب", "التطبيق"],
    diffColors: { "مبتدئ": "bg-emerald-500/10 text-emerald-400", "متوسط": "bg-[#D4AF37]/10 text-[#D4AF37]", "متقدم": "bg-red-500/10 text-red-400" },
  },
  en: {
    all: "All",
    target: ["All", "Chest", "Back", "Legs", "Biceps", "Triceps", "Shoulders", "Hamstrings"],
    equipment: ["All", "Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight"],
    difficulty: ["All", "Beginner", "Intermediate", "Advanced"],
    source: ["All", "Manual", "RapidAPI"],
    creator: ["All", "Trainer", "App"],
    diffColors: { "Beginner": "bg-emerald-500/10 text-emerald-400", "Intermediate": "bg-[#D4AF37]/10 text-[#D4AF37]", "Advanced": "bg-red-500/10 text-red-400" },
  },
};

function normalizeLevelKey(raw: string): string {
  const s = normalizeForSearch(raw).toLowerCase();
  if (s.includes("begin") || s.includes("مبتدئ")) return "beginner";
  if (s.includes("inter") || s.includes("متوسط")) return "intermediate";
  if (s.includes("advanc") || s.includes("متقدم")) return "advanced";
  return s;
}

function localizeDifficulty(levelRaw: string, lang: "ar" | "en"): string {
  const k = normalizeLevelKey(levelRaw);
  if (lang === "ar") {
    if (k === "beginner") return "مبتدئ";
    if (k === "intermediate") return "متوسط";
    if (k === "advanced") return "متقدم";
  } else {
    if (k === "beginner") return "Beginner";
    if (k === "intermediate") return "Intermediate";
    if (k === "advanced") return "Advanced";
  }
  return normalizeForSearch(levelRaw);
}

function exerciseSourceBucket(raw: string): "manual" | "rapidapi" | "other" {
  const s = normalizeForSearch(raw).toLowerCase();
  if (s.includes("rapid")) return "rapidapi";
  if (s.includes("manual") || s.includes("يدوي") || s.includes("app") || s.includes("admin")) return "manual";
  return "other";
}

function sourceFilterMatches(
  dbRaw: string,
  selected: string,
  allLabel: string,
  arSource: string[],
  enSource: string[],
): boolean {
  if (selected === allLabel) return true;
  const bucket = exerciseSourceBucket(dbRaw);
  const manualAr = arSource[1];
  const manualEn = enSource[1];
  const rapidAr = arSource[2];
  const rapidEn = enSource[2];
  if (selected === manualAr || selected === manualEn) return bucket === "manual";
  if (selected === rapidAr || selected === rapidEn) return bucket === "rapidapi";
  return textMatchesQuery(dbRaw, selected);
}

function displaySource(raw: string, lang: "ar" | "en"): string {
  if (exerciseSourceBucket(raw) === "rapidapi") return "RapidAPI";
  if (lang === "ar") return "يدوي";
  return "Manual";
}

function creatorFilterMatches(
  createdBy: string | undefined,
  selected: string,
  allLabel: string,
  arCreator: string[],
  enCreator: string[],
): boolean {
  if (selected === allLabel) return true;
  const cb = (createdBy ?? "app").toLowerCase();
  const trainerAr = arCreator[1];
  const trainerEn = enCreator[1];
  const appAr = arCreator[2];
  const appEn = enCreator[2];
  if (selected === trainerAr || selected === trainerEn) return cb === "trainer" || cb === "admin";
  if (selected === appAr || selected === appEn) return cb === "app";
  return true;
}

function storagePathsFromExerciseMediaPublicUrls(urls: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    if (!u) continue;
    const match = u.match(/\/exercise-media\/(.+?)(?:\?|#|$)/i);
    if (match?.[1]) out.push(match[1]);
  }
  return out;
}

type ExerciseItem = {
  id: string | number;
  name: string;
  nameEn: string;
  nameAr: string;
  target: string;
  targetRaw: string;
  difficulty: string;
  levelRaw: string;
  equipment: string;
  equipmentRaw: string;
  source: string;
  sourceRaw: string;
  gif: string;
  gifUrl?: string;
  mediaType?: "image" | "video";
  thumbnailUrl?: string;
  audioUrl?: string;
  ttsScript?: string;
  ttsScriptAr?: string;
  createdBy?: "app" | "trainer" | "admin";
};

function buildFallback(lang: "ar" | "en"): ExerciseItem[] {
  const rows = exercisesFallback[lang];
  return rows.map((row, idx) => {
    const en = exercisesFallback.en[idx]!;
    const ar = exercisesFallback.ar[idx]!;
    const levelRaw = normalizeLevelKey(
      lang === "ar"
        ? (row.difficulty === "مبتدئ" ? "beginner" : row.difficulty === "متوسط" ? "intermediate" : "advanced")
        : row.difficulty,
    );
    const sourceRaw = row.source === "RapidAPI" || en.source === "RapidAPI" ? "RapidAPI" : "Manual";
    return {
      id: row.id,
      name: row.name,
      nameEn: en.name,
      nameAr: ar.name,
      target: row.target,
      targetRaw: en.target,
      equipment: row.equipment,
      equipmentRaw: en.equipment,
      levelRaw,
      difficulty: localizeDifficulty(levelRaw, lang),
      source: displaySource(sourceRaw, lang),
      sourceRaw,
      gif: row.gif,
      createdBy: "app",
    };
  });
}

type ExerciseFormState = {
  name: string;
  target: string;
  equipment: string;
  difficulty: string;
  minutes: string;
  gifUrl: string;
  thumbnailUrl: string;
  audioUrl: string;
  ttsScript: string;
  ttsScriptAr: string;
};

function FilterSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex min-w-0 w-full flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="relative min-w-0">
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full min-w-0 cursor-pointer appearance-none rounded-lg border border-border bg-secondary px-3 py-2 pe-8 text-foreground focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
          style={{ fontSize: 13 }}
        >
          {options.map((o) => (
            <option key={o} value={o} className="bg-card">
              {o}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

export function ExerciseManagement() {
  const { lang, t } = useLang();
  const fd = filtersData[lang];
  const arFd = filtersData.ar;
  const enFd = filtersData.en;
  const [searchParams, setSearchParams] = useSearchParams();
  const [exercises, setExercises] = useState<ExerciseItem[]>(() => buildFallback(lang));
  const canUseFirebase = Boolean(db && hasFirebaseConfig);

  const [filters, setFilters] = useState({ target: fd.all, equipment: fd.all, difficulty: fd.all, source: fd.all, creator: fd.all });
  const [search, setSearch] = useState("");

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    setSearch((prev) => (q !== prev ? q : prev));
  }, [searchParams]);

  useEffect(() => {
    setFilters({ target: fd.all, equipment: fd.all, difficulty: fd.all, source: fd.all, creator: fd.all });
  }, [lang, fd.all]);
  const [live, setLive] = useState(false);
  const [pendingId, setPendingId] = useState<string | number | null>(null);
  const [busyUpload, setBusyUpload] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view" | null>(null);
  const [activeExercise, setActiveExercise] = useState<ExerciseItem | null>(null);
  const [form, setForm] = useState<ExerciseFormState>({
    name: "",
    target: lang === "ar" ? "الصدر" : "Chest",
    equipment: lang === "ar" ? "وزن الجسم" : "Bodyweight",
    difficulty: fd.difficulty[1] ?? fd.all,
    minutes: "1",
    gifUrl: "",
    thumbnailUrl: "",
    audioUrl: "",
    ttsScript: "",
    ttsScriptAr: "",
  });
  const [selectedMediaFile, setSelectedMediaFile] = useState<File | null>(null);
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string>("");
  const [recordedPaused, setRecordedPaused] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const maxMediaSize = 10 * 1024 * 1024;

  useEffect(() => {
    if (!db || !hasFirebaseConfig) {
      setExercises(buildFallback(lang));
      setLive(false);
      return;
    }
    let channel: ReturnType<typeof db.channel> | null = null;
    let cancelled = false;

    const loadExercises = async () => {
      if (!db) return;
      const resp = await db.from("exercises").select("*").order("name", { ascending: true });
      if (resp.error) {
        console.error("[ExerciseManagement] loadExercises", resp.error);
        if (!cancelled) {
          setLive(false);
          setExercises(buildFallback(lang));
        }
        return;
      }
      const rows = resp.data ?? [];
      const mapped = rows.map((data, idx) => {
        const nameEn = data.name?.toString() ?? "";
        const nameAr = data.name_ar?.toString() ?? "";
        const targetRaw = (data.target ?? data.body_part ?? "").toString();
        const equipmentRaw = (data.equipment ?? "").toString();
        const levelRaw = (data.level ?? data.difficulty ?? "beginner").toString();
        const sourceRaw = (data.source ?? "App").toString();
        const createdByRaw = (data.created_by?.toString() ?? "app").toLowerCase();
        const createdBy: "app" | "trainer" | "admin" =
          createdByRaw === "trainer" ? "trainer" : createdByRaw === "admin" ? "admin" : "app";
        return {
          id: data.id || idx,
          name: lang === "ar" ? (nameAr || nameEn || "تمرين") : (nameEn || nameAr || "Exercise"),
          nameEn,
          nameAr,
          target: targetRaw || (lang === "ar" ? "—" : "—"),
          targetRaw: targetRaw || (lang === "ar" ? "—" : "—"),
          equipment: equipmentRaw || (lang === "ar" ? "وزن الجسم" : "Bodyweight"),
          equipmentRaw: equipmentRaw || (lang === "ar" ? "وزن الجسم" : "Bodyweight"),
          levelRaw,
          difficulty: localizeDifficulty(levelRaw, lang),
          source: displaySource(sourceRaw, lang),
          sourceRaw,
          createdBy,
          gif: "🏋️",
          gifUrl: data.media_url?.toString() ?? data.image_asset_path?.toString(),
          mediaType: (data.media_type?.toString() === "video" ? "video" : "image"),
          thumbnailUrl: data.thumbnail_url?.toString() ?? data.thumbnailUrl?.toString(),
          audioUrl: data.audio_url?.toString(),
          ttsScript: data.tts_script?.toString(),
          ttsScriptAr: data.tts_script_ar?.toString(),
        };
      });
      if (!cancelled) {
        setLive(true);
        setExercises(mapped);
      }
    };

    ensureStaffAuth().then((authed) => {
      if (!authed || cancelled) {
        setExercises(buildFallback(lang));
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

  const filtered = useMemo(
    () =>
      exercises.filter((e) => {
        if (!bilingualOptionMatches(e.targetRaw, filters.target, fd.all, arFd.target, enFd.target)) return false;
        if (!bilingualOptionMatches(e.equipmentRaw, filters.equipment, fd.all, arFd.equipment, enFd.equipment)) return false;
        if (!bilingualOptionMatches(e.levelRaw, filters.difficulty, fd.all, arFd.difficulty, enFd.difficulty)) return false;
        if (!sourceFilterMatches(e.sourceRaw, filters.source, fd.all, arFd.source, enFd.source)) return false;
        if (!creatorFilterMatches(e.createdBy, filters.creator, fd.all, arFd.creator, enFd.creator)) return false;
        const hay = [
          e.name,
          e.nameEn,
          e.nameAr,
          e.targetRaw,
          e.equipmentRaw,
          e.levelRaw,
          e.sourceRaw,
          e.ttsScript,
          e.ttsScriptAr,
        ]
          .filter(Boolean)
          .join(" ");
        if (!textMatchesQuery(hay, search)) return false;
        return true;
      }),
    [arFd, enFd, exercises, fd.all, filters, search],
  );

  const headers = lang === "ar"
    ? ["الصورة", "اسم التمرين", "العضلة المستهدفة", "المستوى", "الأدوات", "المصدر", "الإجراءات"]
    : ["GIF", "Name", "Target Muscle", "Difficulty", "Equipment", "Source", "Actions"];

  const resetModalState = () => {
    setModalMode(null);
    setActiveExercise(null);
    setSelectedMediaFile(null);
    setSelectedAudioFile(null);
    setRecording(false);
    setRecordedBlob(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl("");
    setRecordedPaused(false);
    try {
      recorderRef.current?.stop();
    } catch {
      // ignore
    }
    recorderRef.current = null;
    chunksRef.current = [];
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const openCreateModal = () => {
    setForm({
      name: "",
      target: lang === "ar" ? "الصدر" : "Chest",
      equipment: lang === "ar" ? "وزن الجسم" : "Bodyweight",
      difficulty: fd.difficulty[1] ?? fd.all,
      minutes: "1",
      gifUrl: "",
      thumbnailUrl: "",
      audioUrl: "",
      ttsScript: "",
      ttsScriptAr: "",
    });
    setActiveExercise(null);
    setSelectedMediaFile(null);
    setSelectedAudioFile(null);
    setRecordedBlob(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl("");
    setModalMode("create");
  };

  const openEditModal = (exercise: ExerciseItem) => {
    setForm({
      name: exercise.name,
      target: exercise.target,
      equipment: exercise.equipment,
      difficulty: exercise.difficulty,
      gifUrl: exercise.gifUrl ?? "",
      thumbnailUrl: exercise.thumbnailUrl ?? "",
      minutes: String((exercise as any).minutes ?? "1"),
      audioUrl: exercise.audioUrl ?? "",
      ttsScript: exercise.ttsScript ?? "",
      ttsScriptAr: exercise.ttsScriptAr ?? "",
    });
    setActiveExercise(exercise);
    setSelectedMediaFile(null);
    setSelectedAudioFile(null);
    setRecordedBlob(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl("");
    setModalMode("edit");
  };

  const openViewModal = (exercise: ExerciseItem) => {
    setActiveExercise(exercise);
    setModalMode("view");
  };

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

  const supportedRecorderMime = () => {
    const prefers = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    for (const m of prefers) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof MediaRecorder !== "undefined" && (MediaRecorder as any).isTypeSupported?.(m)) return m;
    }
    return "";
  };

  const startRecording = async () => {
    if (recording) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      window.alert(t("المتصفح لا يدعم التسجيل الصوتي", "Your browser doesn't support audio recording"));
      return;
    }
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl("");
    setRecordedBlob(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = supportedRecorderMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setRecording(false);
        setRecordedPaused(false);
        chunksRef.current = [];
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };
      rec.start();
      setRecording(true);
      setRecordedPaused(false);
    } catch {
      window.alert(t("لم يتم السماح بالمايكروفون", "Microphone permission denied"));
      setRecording(false);
    }
  };

  const stopRecording = () => {
    if (!recording) return;
    try {
      recorderRef.current?.stop();
    } catch {
      setRecording(false);
    }
  };

  const togglePauseRecording = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      setRecordedPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      setRecordedPaused(false);
    }
  };

  const discardRecording = () => {
    if (recording) stopRecording();
    setRecordedBlob(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl("");
    setRecordedPaused(false);
  };

  const validateSelectedFile = (file: File | null) => {
    if (!file) return true;
    if (file.size > maxMediaSize) {
      window.alert(t("حجم الملف يجب ألا يتجاوز 10 ميجا", "File size must be <= 10MB"));
      return false;
    }
    return true;
  };

  const handleAddExercise = async () => {
    const input = {
      name: form.name.trim(),
      target: form.target.trim(),
      equipment: form.equipment.trim(),
      difficulty: form.difficulty.trim(),
      gifUrl: normalizeMediaUrl(form.gifUrl),
      thumbnailUrl: form.thumbnailUrl.trim(),
      minutes: Number.parseInt(form.minutes.trim() || "1", 10),
      audioUrl: form.audioUrl.trim(),
      ttsScript: form.ttsScript.trim(),
      ttsScriptAr: form.ttsScriptAr.trim(),
    };
    if (!input.name) return;
    if (!Number.isFinite(input.minutes) || input.minutes <= 0 || input.minutes > 60) {
      window.alert(t("أدخل مدة صحيحة بالدقائق (1-60)", "Enter a valid duration in minutes (1-60)"));
      return;
    }
    if (!validateSelectedFile(selectedMediaFile) || !validateSelectedFile(selectedAudioFile)) return;

    if (!canUseFirebase || !db) {
      const levelRaw = normalizeLevelKey(input.difficulty);
      const localExercise: ExerciseItem = {
        id: `local-${Date.now()}`,
        name: input.name,
        nameEn: input.name,
        nameAr: input.name,
        target: input.target,
        targetRaw: input.target,
        equipment: input.equipment,
        equipmentRaw: input.equipment,
        levelRaw,
        difficulty: localizeDifficulty(levelRaw, lang),
        source: displaySource("Manual", lang),
        sourceRaw: "Manual",
        gif: "🏋️",
        gifUrl: input.gifUrl,
        thumbnailUrl: input.thumbnailUrl || undefined,
        audioUrl: input.audioUrl,
        ttsScript: input.ttsScript,
        ttsScriptAr: input.ttsScriptAr,
        createdBy: "trainer",
      };
      setExercises((prev) => [localExercise, ...prev]);
      resetModalState();
      return;
    }

    await ensureStaffAuth();
    setBusyUpload(true);
    let mediaUrl = input.gifUrl || null;
    let mediaType: "image" | "video" = looksLikeVideoLink(input.gifUrl) ? "video" : "image";
    let audioUrl = input.audioUrl || null;
    try {
      if (selectedMediaFile) {
        mediaType = selectedMediaFile.type.startsWith("video/") ? "video" : "image";
        mediaUrl = await uploadFile(selectedMediaFile, "media");
      }
      if (selectedAudioFile) {
        audioUrl = await uploadFile(selectedAudioFile, "audio");
      }
      if (!audioUrl && recordedBlob) {
        const ext = (recorderRef.current?.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
        const recordedFile = new File([recordedBlob], `coach-recording.${ext}`, { type: recordedBlob.type || "audio/webm" });
        audioUrl = await uploadFile(recordedFile, "audio");
      }
    } finally {
      setBusyUpload(false);
    }
    await db.from("exercises").insert({
      name: input.name,
      name_ar: input.name,
      type: "home",
      target: input.target,
      minutes: input.minutes,
      calories: 0,
      equipment: input.equipment,
      level: input.difficulty,
      image_asset_path: mediaUrl,
      media_url: mediaUrl,
      media_type: mediaType,
      thumbnail_url: input.thumbnailUrl || null,
      audio_url: audioUrl,
      tts_script: input.ttsScript || null,
      tts_script_ar: input.ttsScriptAr || null,
      created_by: "trainer",
      source: "Admin",
    });
    resetModalState();
  };

  const handleEditExercise = async () => {
    if (!activeExercise) return;
    const exercise = activeExercise;
    const input = {
      name: form.name.trim(),
      target: form.target.trim(),
      equipment: form.equipment.trim(),
      difficulty: form.difficulty.trim(),
      gifUrl: normalizeMediaUrl(form.gifUrl),
      thumbnailUrl: form.thumbnailUrl.trim(),
      minutes: Number.parseInt(form.minutes.trim() || "1", 10),
      audioUrl: form.audioUrl.trim(),
      ttsScript: form.ttsScript.trim(),
      ttsScriptAr: form.ttsScriptAr.trim(),
    };
    if (!input.name) return;
    if (!Number.isFinite(input.minutes) || input.minutes <= 0 || input.minutes > 60) {
      window.alert(t("أدخل مدة صحيحة بالدقائق (1-60)", "Enter a valid duration in minutes (1-60)"));
      return;
    }
    if (!validateSelectedFile(selectedMediaFile) || !validateSelectedFile(selectedAudioFile)) return;

    if (!canUseFirebase || !db || typeof exercise.id !== "string") {
      const levelRaw = normalizeLevelKey(input.difficulty);
      setExercises((prev) =>
        prev.map((item) =>
          item.id === exercise.id
            ? {
                ...item,
                ...input,
                nameEn: lang === "en" ? input.name : item.nameEn,
                nameAr: lang === "ar" ? input.name : item.nameAr,
                targetRaw: input.target,
                equipmentRaw: input.equipment,
                levelRaw,
                difficulty: localizeDifficulty(levelRaw, lang),
                source: item.source,
                sourceRaw: item.sourceRaw,
              }
            : item,
        ),
      );
      resetModalState();
      return;
    }

    try {
      setPendingId(exercise.id);
      await ensureStaffAuth();
      setBusyUpload(true);
      let mediaUrl = input.gifUrl || exercise.gifUrl || null;
      let mediaType: "image" | "video" =
        selectedMediaFile
          ? (selectedMediaFile.type.startsWith("video/") ? "video" : "image")
          : looksLikeVideoLink(input.gifUrl || mediaUrl || "") ? "video" : (exercise.mediaType ?? "image");
      let audioUrl = input.audioUrl || exercise.audioUrl || null;
      if (selectedMediaFile) {
        mediaUrl = await uploadFile(selectedMediaFile, "media");
      }
      if (selectedAudioFile) {
        audioUrl = await uploadFile(selectedAudioFile, "audio");
      }
      if (!audioUrl && recordedBlob) {
        const ext = (recorderRef.current?.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
        const recordedFile = new File([recordedBlob], `coach-recording.${ext}`, { type: recordedBlob.type || "audio/webm" });
        audioUrl = await uploadFile(recordedFile, "audio");
      }
      await db.from("exercises").update({
        name: input.name,
        name_ar: input.name,
        target: input.target,
        equipment: input.equipment,
        level: input.difficulty,
        minutes: input.minutes,
        image_asset_path: mediaUrl,
        media_url: mediaUrl,
        media_type: mediaType,
        thumbnail_url: input.thumbnailUrl || null,
        audio_url: audioUrl,
        tts_script: input.ttsScript || null,
        tts_script_ar: input.ttsScriptAr || null,
        created_by: "trainer",
      }).eq("id", exercise.id);
      resetModalState();
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
      await ensureStaffAuth();
      const paths = storagePathsFromExerciseMediaPublicUrls([exercise.gifUrl, exercise.audioUrl]);
      if (paths.length > 0) {
        const rm = await db.storage.from("exercise-media").remove(paths);
        if (rm.error) console.warn("[ExerciseManagement] storage remove", rm.error);
      }
      await db.from("exercises").delete().eq("id", exercise.id);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl text-[#F5EAD4] sm:text-2xl">{t("إدارة التمارين", "Exercise Management")}</h1>
          <p className="text-muted-foreground text-sm sm:text-[14px]">
            {t(`إدارة مكتبة التمارين الخاصة بك (${exercises.length} تمرين)`, `Manage your exercise library (${exercises.length} exercises)`)} ·{" "}
            <span className={live ? "text-emerald-400" : "text-amber-400"}>
            {live
              ? t("متصل", "Connected")
              : adminDelivery
                ? t("غير متصل", "Offline")
                : t("وضع تجريبي محلي", "Local demo mode")}
            </span>
            {busyUpload ? ` · ${t("جارٍ رفع الميديا...", "Uploading media...")}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="flex w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-[#012217] shadow-[0_0_20px_rgba(212,175,55,0.15)] transition-colors hover:bg-[#c9a430] sm:w-auto"
          style={{ fontSize: 14, fontWeight: 600 }}
        >
          <Plus className="h-4 w-4" />
          {t("إضافة تمرين جديد", "Add New Exercise")}
        </button>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <div className="flex min-w-0 items-stretch gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-2 2xl:col-span-2">
          <div className="flex shrink-0 items-center ps-1">
            <Filter className="h-4 w-4 text-[#D4AF37]" />
          </div>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder={t("ابحث عن تمرين...", "Search exercises...")}
              value={search}
              onChange={(e) => {
                const v = e.target.value;
                setSearch(v);
                const next = new URLSearchParams(searchParams);
                if (v.trim()) next.set("q", v);
                else next.delete("q");
                setSearchParams(next, { replace: true });
              }}
              className="h-10 w-full rounded-lg border border-border bg-secondary py-2 ps-9 pe-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
              style={{ fontSize: 13 }}
            />
          </div>
        </div>
        <FilterSelect label={t("العضلة", "Target")} options={fd.target} value={filters.target} onChange={(v) => setFilters({ ...filters, target: v })} />
        <FilterSelect label={t("الأدوات", "Equipment")} options={fd.equipment} value={filters.equipment} onChange={(v) => setFilters({ ...filters, equipment: v })} />
        <FilterSelect label={t("المستوى", "Difficulty")} options={fd.difficulty} value={filters.difficulty} onChange={(v) => setFilters({ ...filters, difficulty: v })} />
        <FilterSelect label={t("المصدر", "Source")} options={fd.source} value={filters.source} onChange={(v) => setFilters({ ...filters, source: v })} />
        <FilterSelect label={t("المنشئ", "Creator")} options={fd.creator} value={filters.creator} onChange={(v) => setFilters({ ...filters, creator: v })} />
      </div>

      {/* Data Table */}
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
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
                    (() => {
                      const url = e.gifUrl!;
                      const thumb = e.thumbnailUrl?.trim() || videoThumbUrl(url);
                      const direct = isDirectVideoUrl(url);
                      if (thumb && !direct) {
                        return (
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-border bg-secondary">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumb} alt={e.name} className="w-full h-full object-cover" loading="lazy" />
                            <div className="absolute inset-0 grid place-items-center bg-black/20">
                              <span className="grid place-items-center w-5 h-5 rounded-full bg-black/55">
                                <Play className="w-3 h-3 text-white translate-x-[0.5px]" />
                              </span>
                            </div>
                          </div>
                        );
                      }
                      if (direct) {
                        return (
                          <video
                            src={url}
                            className="w-10 h-10 rounded-lg object-cover border border-border bg-secondary"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        );
                      }
                      return (
                        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center border border-border">
                          <Play className="w-4 h-4 text-[#D4AF37]" />
                        </div>
                      );
                    })()
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center" style={{ fontSize: 20 }}>
                      {e.gif}
                    </div>
                  )}
                </td>
                <td className="max-w-[220px] px-4 py-3 text-[#F5EAD4] sm:max-w-xs" style={{ fontSize: 13, fontWeight: 500 }}>
                  <span className="line-clamp-2 break-words">{e.name}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>{e.target}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full ${(fd.diffColors as any)[e.difficulty] || ""}`} style={{ fontSize: 11 }}>{e.difficulty}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>{e.equipment}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full ${e.source === "RapidAPI" ? "bg-blue-500/10 text-blue-400" : "bg-secondary text-muted-foreground"}`} style={{ fontSize: 11 }}>{e.source}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <button
                      onClick={() => openViewModal(e)}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-[#D4AF37] transition-colors cursor-pointer"
                      title={t("عرض", "View")}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEditModal(e)}
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
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground" style={{ fontSize: 14 }}>
            {exercises.length === 0 && live
              ? t("لا توجد تمارين في قاعدة البيانات بعد.", "No exercises in the database yet.")
              : t("لا توجد تمارين تطابق الفلاتر الحالية.", "No exercises match the current filters.")}
          </div>
        )}
      </div>
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:p-4">
          <div className="max-h-[min(90vh,900px)] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[#F5EAD4]" style={{ fontSize: 18, fontWeight: 600 }}>
                {modalMode === "create"
                  ? t("إضافة تمرين جديد", "Add New Exercise")
                  : modalMode === "edit"
                    ? t("تعديل تمرين", "Edit Exercise")
                    : t("عرض التمرين", "View Exercise")}
              </h3>
              <button className="text-muted-foreground hover:text-[#D4AF37]" onClick={resetModalState}>
                {t("إغلاق", "Close")}
              </button>
            </div>
            {modalMode === "view" && activeExercise ? (
              <div className="space-y-2 text-muted-foreground" style={{ fontSize: 14 }}>
                <p><span className="text-[#F5EAD4]">{t("الاسم", "Name")}:</span> {activeExercise.name}</p>
                <p><span className="text-[#F5EAD4]">{t("العضلة", "Target")}:</span> {activeExercise.target}</p>
                <p><span className="text-[#F5EAD4]">{t("المستوى", "Difficulty")}:</span> {activeExercise.difficulty}</p>
                <p><span className="text-[#F5EAD4]">{t("الأدوات", "Equipment")}:</span> {activeExercise.equipment}</p>
                {activeExercise.gifUrl ? <p className="break-all"><span className="text-[#F5EAD4]">{t("رابط الميديا", "Media URL")}:</span> {activeExercise.gifUrl}</p> : null}
                {activeExercise.audioUrl ? <p className="break-all"><span className="text-[#F5EAD4]">{t("رابط الصوت", "Audio URL")}:</span> {activeExercise.audioUrl}</p> : null}
                {activeExercise.ttsScript ? <p className="break-words"><span className="text-[#F5EAD4]">{t("نص النطق", "TTS script")}:</span> {activeExercise.ttsScript}</p> : null}
                {activeExercise.ttsScriptAr ? <p className="break-words"><span className="text-[#F5EAD4]">{t("نص النطق العربي", "Arabic TTS script")}:</span> {activeExercise.ttsScriptAr}</p> : null}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-muted-foreground block mb-1" style={{ fontSize: 12 }}>{t("اسم التمرين", "Exercise name")}</label>
                    <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border" />
                  </div>
                  <div>
                    <label className="text-muted-foreground block mb-1" style={{ fontSize: 12 }}>{t("العضلة المستهدفة", "Target muscle")}</label>
                    <input value={form.target} onChange={(e) => setForm((prev) => ({ ...prev, target: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border" />
                  </div>
                  <div>
                    <label className="text-muted-foreground block mb-1" style={{ fontSize: 12 }}>{t("مدة التمرين (دقيقة)", "Duration (minutes)")}</label>
                    <input
                      value={form.minutes}
                      onChange={(e) => setForm((prev) => ({ ...prev, minutes: e.target.value }))}
                      inputMode="numeric"
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="text-muted-foreground block mb-1" style={{ fontSize: 12 }}>{t("الأدوات", "Equipment")}</label>
                    <input value={form.equipment} onChange={(e) => setForm((prev) => ({ ...prev, equipment: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border" />
                  </div>
                  <div>
                    <label className="text-muted-foreground block mb-1" style={{ fontSize: 12 }}>{t("المستوى", "Difficulty")}</label>
                    <select value={form.difficulty} onChange={(e) => setForm((prev) => ({ ...prev, difficulty: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border">
                      {fd.difficulty.filter((x) => x !== fd.all).map((x) => (
                        <option key={x} value={x}>{x}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-muted-foreground block mb-1" style={{ fontSize: 12 }}>{t("رابط الميديا (اختياري)", "Media URL (optional)")}</label>
                    <input value={form.gifUrl} onChange={(e) => setForm((prev) => ({ ...prev, gifUrl: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border" />
                  </div>
                  <div>
                    <label className="text-muted-foreground block mb-1" style={{ fontSize: 12 }}>{t("رابط صورة الفيديو (اختياري)", "Video thumbnail URL (optional)")}</label>
                    <input value={form.thumbnailUrl} onChange={(e) => setForm((prev) => ({ ...prev, thumbnailUrl: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border" />
                  </div>
                  <div>
                    <label className="text-muted-foreground block mb-1" style={{ fontSize: 12 }}>{t("رابط الصوت (اختياري)", "Audio URL (optional)")}</label>
                    <input value={form.audioUrl} onChange={(e) => setForm((prev) => ({ ...prev, audioUrl: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-muted-foreground block mb-1" style={{ fontSize: 12 }}>{t("نص النطق للتطبيق (اختياري)", "TTS script for app (optional)")}</label>
                    <textarea
                      value={form.ttsScript}
                      onChange={(e) => setForm((prev) => ({ ...prev, ttsScript: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border min-h-24"
                      placeholder={t("اكتب النص الذي تريد نطقه للمستخدم أثناء التمرين", "Write the text you want spoken during the exercise")}
                    />
                  </div>
                  <div>
                    <label className="text-muted-foreground block mb-1" style={{ fontSize: 12 }}>{t("نص النطق العربي (اختياري)", "Arabic TTS script (optional)")}</label>
                    <textarea
                      value={form.ttsScriptAr}
                      onChange={(e) => setForm((prev) => ({ ...prev, ttsScriptAr: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border min-h-24"
                      placeholder={t("اكتب النص العربي الذي سيتم نطقه للمستخدم", "Write the Arabic text that will be spoken to the user")}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-3">
                  <div>
                    <p className="mb-2 text-muted-foreground" style={{ fontSize: 12 }}>
                      {t("رفع صورة/فيديو (حد 10MB)", "Upload image/video (max 10MB)")}
                    </p>
                    <label className="group flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-[#D4AF37]/55 bg-gradient-to-b from-[#D4AF37]/14 to-[#D4AF37]/06 px-4 py-5 text-center shadow-[0_0_24px_rgba(212,175,55,0.12)] transition-all hover:border-[#D4AF37] hover:from-[#D4AF37]/22 hover:shadow-[0_0_32px_rgba(212,175,55,0.2)] focus-within:border-[#D4AF37] focus-within:ring-2 focus-within:ring-[#D4AF37]/35">
                      <Upload className="h-8 w-8 text-[#D4AF37] opacity-90 group-hover:opacity-100" aria-hidden />
                      <span className="font-semibold text-[#D4AF37]" style={{ fontSize: 14 }}>
                        {t("اختر ملف الميديا", "Choose media file")}
                      </span>
                      <span className="text-muted-foreground" style={{ fontSize: 11 }}>
                        {t("PNG أو JPG أو MP4 حتى 10MB", "PNG, JPG or MP4 up to 10MB")}
                      </span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={(e) => setSelectedMediaFile(e.target.files?.[0] ?? null)}
                        className="sr-only"
                      />
                    </label>
                    <p className="mt-2 text-muted-foreground" style={{ fontSize: 11 }}>
                      {selectedMediaFile
                        ? `${selectedMediaFile.name} — ${(selectedMediaFile.size / (1024 * 1024)).toFixed(2)} MB`
                        : t("يمكنك رفع صورة أو فيديو أو استخدام رابط الميديا بالأعلى", "You can upload an image/video or use the media URL above")}
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-muted-foreground" style={{ fontSize: 12 }}>
                      {t("رفع ملف صوتي (حد 10MB)", "Upload audio (max 10MB)")}
                    </p>
                    <label className="group flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-[#D4AF37]/55 bg-gradient-to-b from-[#D4AF37]/14 to-[#D4AF37]/06 px-4 py-5 text-center shadow-[0_0_24px_rgba(212,175,55,0.12)] transition-all hover:border-[#D4AF37] hover:from-[#D4AF37]/22 hover:shadow-[0_0_32px_rgba(212,175,55,0.2)] focus-within:border-[#D4AF37] focus-within:ring-2 focus-within:ring-[#D4AF37]/35">
                      <Upload className="h-8 w-8 text-[#D4AF37] opacity-90 group-hover:opacity-100" aria-hidden />
                      <span className="font-semibold text-[#D4AF37]" style={{ fontSize: 14 }}>
                        {t("اختر ملف الصوت", "Choose audio file")}
                      </span>
                      <span className="text-muted-foreground" style={{ fontSize: 11 }}>
                        {t("MP3 أو M4A حتى 10MB", "MP3 or M4A up to 10MB")}
                      </span>
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={(e) => setSelectedAudioFile(e.target.files?.[0] ?? null)}
                        className="sr-only"
                      />
                    </label>
                    <p className="mt-2 text-muted-foreground" style={{ fontSize: 11 }}>
                      {selectedAudioFile
                        ? `${selectedAudioFile.name} — ${(selectedAudioFile.size / (1024 * 1024)).toFixed(2)} MB`
                        : t("اختياري: ملف صوتي جاهز للتشغيل داخل التطبيق", "Optional: ready-made audio file for the app")}
                    </p>
                    <div className="mt-4 rounded-xl border border-border/70 bg-secondary/30 p-3">
                      <p className="text-muted-foreground" style={{ fontSize: 12 }}>
                        {t("أو سجّل بصوت المدرب (من المتصفح)", "Or record coach voice (in-browser)")}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {!recording ? (
                          <button
                            type="button"
                            onClick={startRecording}
                            className="inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/40 bg-card px-3 py-2 text-xs text-[#D4AF37] hover:bg-[#D4AF37]/10"
                          >
                            <Mic className="h-4 w-4" />
                            {t("بدء التسجيل", "Start recording")}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={togglePauseRecording}
                              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-[#F5EAD4] hover:bg-secondary/60"
                            >
                              {recordedPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                              {recordedPaused ? t("متابعة", "Resume") : t("إيقاف مؤقت", "Pause")}
                            </button>
                            <button
                              type="button"
                              onClick={stopRecording}
                              className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-3 py-2 text-xs font-medium text-[#012217] hover:bg-[#c9a430]"
                            >
                              <Square className="h-4 w-4" />
                              {t("إنهاء", "Stop")}
                            </button>
                          </>
                        )}
                        {recordedBlob ? (
                          <button
                            type="button"
                            onClick={discardRecording}
                            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:bg-secondary/60 hover:text-[#F5EAD4]"
                          >
                            <Trash className="h-4 w-4" />
                            {t("حذف التسجيل", "Discard")}
                          </button>
                        ) : null}
                      </div>
                      {recordedUrl ? (
                        <div className="mt-3">
                          <audio controls src={recordedUrl} className="w-full" />
                          <p className="mt-2 text-muted-foreground" style={{ fontSize: 11 }}>
                            {t("سيتم رفع التسجيل تلقائيًا عند حفظ التمرين.", "Recording will be uploaded automatically when you save the exercise.")}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={resetModalState} className="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-[#F5EAD4] hover:bg-secondary">
                {t("إلغاء", "Cancel")}
              </button>
              {modalMode !== "view" && (
                <button
                  onClick={modalMode === "create" ? handleAddExercise : handleEditExercise}
                  disabled={busyUpload}
                  className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#012217] hover:bg-[#c9a430] disabled:opacity-50"
                >
                  {modalMode === "create" ? t("إضافة", "Add") : t("حفظ", "Save")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
