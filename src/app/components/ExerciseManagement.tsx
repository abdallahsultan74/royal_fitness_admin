import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Edit3, Trash2, Eye, ChevronDown, Filter, Upload } from "lucide-react";
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
  ttsScript?: string;
  ttsScriptAr?: string;
  createdBy?: "app" | "trainer" | "admin";
};
type ExerciseFormState = {
  name: string;
  target: string;
  equipment: string;
  difficulty: string;
  gifUrl: string;
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
  const [exercises, setExercises] = useState<ExerciseItem[]>(exercisesFallback[lang]);
  const canUseFirebase = Boolean(db && hasFirebaseConfig);

  const [filters, setFilters] = useState({ target: fd.all, equipment: fd.all, difficulty: fd.all, source: fd.all, creator: fd.all });
  const [search, setSearch] = useState("");
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
    gifUrl: "",
    audioUrl: "",
    ttsScript: "",
    ttsScriptAr: "",
  });
  const [selectedMediaFile, setSelectedMediaFile] = useState<File | null>(null);
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
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
          ttsScript: data.tts_script?.toString(),
          ttsScriptAr: data.tts_script_ar?.toString(),
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

  const resetModalState = () => {
    setModalMode(null);
    setActiveExercise(null);
    setSelectedMediaFile(null);
    setSelectedAudioFile(null);
  };

  const openCreateModal = () => {
    setForm({
      name: "",
      target: lang === "ar" ? "الصدر" : "Chest",
      equipment: lang === "ar" ? "وزن الجسم" : "Bodyweight",
      difficulty: fd.difficulty[1] ?? fd.all,
      gifUrl: "",
      audioUrl: "",
      ttsScript: "",
      ttsScriptAr: "",
    });
    setActiveExercise(null);
    setSelectedMediaFile(null);
    setSelectedAudioFile(null);
    setModalMode("create");
  };

  const openEditModal = (exercise: ExerciseItem) => {
    setForm({
      name: exercise.name,
      target: exercise.target,
      equipment: exercise.equipment,
      difficulty: exercise.difficulty,
      gifUrl: exercise.gifUrl ?? "",
      audioUrl: exercise.audioUrl ?? "",
      ttsScript: exercise.ttsScript ?? "",
      ttsScriptAr: exercise.ttsScriptAr ?? "",
    });
    setActiveExercise(exercise);
    setSelectedMediaFile(null);
    setSelectedAudioFile(null);
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
      gifUrl: form.gifUrl.trim(),
      audioUrl: form.audioUrl.trim(),
      ttsScript: form.ttsScript.trim(),
      ttsScriptAr: form.ttsScriptAr.trim(),
    };
    if (!input.name) return;
    if (!validateSelectedFile(selectedMediaFile) || !validateSelectedFile(selectedAudioFile)) return;

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
        audioUrl: input.audioUrl,
        ttsScript: input.ttsScript,
        ttsScriptAr: input.ttsScriptAr,
      };
      setExercises((prev) => [localExercise, ...prev]);
      resetModalState();
      return;
    }

    await ensureAdminAuth();
    setBusyUpload(true);
    let mediaUrl = input.gifUrl || null;
    let mediaType: "image" | "video" = "image";
    let audioUrl = input.audioUrl || null;
    try {
      if (selectedMediaFile) {
        mediaType = selectedMediaFile.type.startsWith("video/") ? "video" : "image";
        mediaUrl = await uploadFile(selectedMediaFile, "media");
      }
      if (selectedAudioFile) {
        audioUrl = await uploadFile(selectedAudioFile, "audio");
      }
    } finally {
      setBusyUpload(false);
    }
    await db.from("exercises").insert({
      name: input.name,
      name_ar: input.name,
      type: "home",
      target: input.target,
      minutes: 1,
      calories: 0,
      equipment: input.equipment,
      level: input.difficulty,
      image_asset_path: mediaUrl,
      media_url: mediaUrl,
      media_type: mediaType,
      audio_url: audioUrl,
      tts_script: input.ttsScript || null,
      tts_script_ar: input.ttsScriptAr || null,
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
      gifUrl: form.gifUrl.trim(),
      audioUrl: form.audioUrl.trim(),
      ttsScript: form.ttsScript.trim(),
      ttsScriptAr: form.ttsScriptAr.trim(),
    };
    if (!input.name) return;
    if (!validateSelectedFile(selectedMediaFile) || !validateSelectedFile(selectedAudioFile)) return;

    if (!canUseFirebase || !db || typeof exercise.id !== "string") {
      setExercises((prev) =>
        prev.map((item) => (item.id === exercise.id ? { ...item, ...input } : item)),
      );
      resetModalState();
      return;
    }

    try {
      setPendingId(exercise.id);
      await ensureAdminAuth();
      setBusyUpload(true);
      let mediaUrl = input.gifUrl || exercise.gifUrl || null;
      let mediaType: "image" | "video" = exercise.mediaType ?? "image";
      let audioUrl = input.audioUrl || exercise.audioUrl || null;
      if (selectedMediaFile) {
        mediaType = selectedMediaFile.type.startsWith("video/") ? "video" : "image";
        mediaUrl = await uploadFile(selectedMediaFile, "media");
      }
      if (selectedAudioFile) {
        audioUrl = await uploadFile(selectedAudioFile, "audio");
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
        tts_script: input.ttsScript || null,
        tts_script_ar: input.ttsScriptAr || null,
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
      await ensureAdminAuth();
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
              {live ? t("مربوط ببيانات التطبيق", "Synced with app data") : t("وضع تجريبي محلي", "Local demo mode")}
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
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="flex min-w-0 items-stretch gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-2">
          <div className="flex shrink-0 items-center ps-1">
            <Filter className="h-4 w-4 text-[#D4AF37]" />
          </div>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("ابحث عن تمرين...", "Search exercises...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-secondary py-2 ps-9 pe-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
              style={{ fontSize: 13 }}
            />
          </div>
        </div>
        <FilterSelect label={t("العضلة", "Target")} options={fd.target} value={filters.target} onChange={(v) => setFilters({ ...filters, target: v })} />
        <FilterSelect label={t("الأدوات", "Equipment")} options={fd.equipment} value={filters.equipment} onChange={(v) => setFilters({ ...filters, equipment: v })} />
        <FilterSelect label={t("المستوى", "Difficulty")} options={fd.difficulty} value={filters.difficulty} onChange={(v) => setFilters({ ...filters, difficulty: v })} />
        <FilterSelect label={t("المصدر", "Source")} options={fd.source} value={filters.source} onChange={(v) => setFilters({ ...filters, source: v })} />
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
                    <video src={e.gifUrl} className="w-10 h-10 rounded-lg object-cover border border-border bg-secondary" muted />
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
            {t("لا توجد تمارين تطابق الفلاتر الحالية.", "No exercises match the current filters.")}
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
