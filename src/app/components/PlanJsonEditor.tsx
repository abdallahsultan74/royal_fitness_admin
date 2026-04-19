import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Upload, Wand2 } from "lucide-react";
import { db, ensureStaffAuth, hasFirebaseConfig } from "../firebase";

export type PlanExerciseDraft = {
  id: string;
  name: string;
  name_ar: string;
  minutes: number;
  calories: number;
  level: string;
  type: string;
  image_asset: string;
  steps: number;
  rating: number;
  audio_url: string;
  tts_script: string;
  tts_script_ar: string;
  instructions: string;
  media_type: "image" | "video";
};

export type PlanSlotDraft = {
  title_key: string;
  title: string;
  title_ar: string;
  time: string;
  done: boolean;
  description: string;
  description_ar: string;
  exercises: PlanExerciseDraft[];
};

export type PlanJsonDraft = { slots: PlanSlotDraft[] };

function newExercise(i: number): PlanExerciseDraft {
  return {
    id: `ex-${Date.now()}-${i}`,
    name: "",
    name_ar: "",
    minutes: 5,
    calories: 40,
    level: "beginner",
    type: "home",
    image_asset: "",
    steps: 1,
    rating: 4.5,
    audio_url: "",
    tts_script: "",
    tts_script_ar: "",
    instructions: "",
    media_type: "image",
  };
}

function newSlot(): PlanSlotDraft {
  return {
    title_key: "",
    title: "",
    title_ar: "",
    time: "",
    done: false,
    description: "",
    description_ar: "",
    exercises: [newExercise(0)],
  };
}

function normalizeExercise(m: Record<string, unknown>, idx: number): PlanExerciseDraft {
  const instr = m.instructions;
  let instructionsText = "";
  if (typeof instr === "string") instructionsText = instr;
  else if (Array.isArray(instr)) instructionsText = instr.map(String).join("\n");
  const mediaRaw = String(m.media_type ?? m.mediaType ?? "image").toLowerCase();
  return {
    id: String(m.id ?? `ex-${idx}`),
    name: String(m.name ?? ""),
    name_ar: String(m.name_ar ?? ""),
    minutes: Number(m.minutes ?? 5) || 5,
    calories: Number(m.calories ?? 40) || 0,
    level: String(m.level ?? "beginner"),
    type: String(m.type ?? "home"),
    image_asset: String(
      m.image_url ?? m.gif ?? m.media_url ?? m.image_asset ?? "",
    ),
    steps: Number(m.steps ?? m.exercise_steps ?? 1) || 1,
    rating: Number(m.rating ?? 4.5) || 4.5,
    audio_url: String(m.audio_url ?? ""),
    tts_script: String(m.tts_script ?? ""),
    tts_script_ar: String(m.tts_script_ar ?? ""),
    instructions: instructionsText,
    media_type: mediaRaw === "video" ? "video" : "image",
  };
}

function normalizeSlot(s: unknown): PlanSlotDraft {
  if (!s || typeof s !== "object") return newSlot();
  const m = s as Record<string, unknown>;
  const rawEx = m.exercises;
  const exercises: PlanExerciseDraft[] = Array.isArray(rawEx)
    ? rawEx.map((e, ei) =>
        e && typeof e === "object"
          ? normalizeExercise(e as Record<string, unknown>, ei)
          : newExercise(ei),
      )
    : [newExercise(0)];
  return {
    title_key: String(m.title_key ?? ""),
    title: String(m.title ?? ""),
    title_ar: String(m.title_ar ?? ""),
    time: String(m.time ?? m.time_label ?? m.at ?? ""),
    done: Boolean(m.done ?? m.completed),
    description: String(m.description ?? m.notes ?? ""),
    description_ar: String(m.description_ar ?? m.notes_ar ?? ""),
    exercises: exercises.length ? exercises : [newExercise(0)],
  };
}

export function normalizePlanJson(raw: unknown): PlanJsonDraft {
  if (!raw || typeof raw !== "object") return { slots: [] };
  const o = raw as Record<string, unknown>;
  const root = o.slots ?? o.todays_plan ?? o.days ?? o.items;
  if (!Array.isArray(root)) return { slots: [] };
  const slots = root.map((x) => normalizeSlot(x));
  return { slots: slots.length ? slots : [] };
}

export function serializePlanJson(d: PlanJsonDraft): Record<string, unknown> {
  return {
    slots: d.slots.map((slot) => ({
      ...(slot.title_key.trim() ? { title_key: slot.title_key.trim() } : {}),
      title: slot.title,
      title_ar: slot.title_ar,
      time: slot.time,
      done: slot.done,
      description: slot.description,
      description_ar: slot.description_ar,
      exercises: slot.exercises.map((ex) => {
        const instrLines = ex.instructions
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        return {
          id: ex.id,
          name: ex.name,
          name_ar: ex.name_ar,
          minutes: ex.minutes,
          calories: ex.calories,
          level: ex.level,
          type: ex.type,
          steps: ex.steps,
          rating: ex.rating,
          media_type: ex.media_type,
          ...(ex.image_asset.trim()
            ? ex.image_asset.startsWith("http")
              ? { image_url: ex.image_asset.trim() }
              : { image_asset: ex.image_asset.trim() }
            : {}),
          ...(ex.audio_url.trim() ? { audio_url: ex.audio_url.trim() } : {}),
          ...(ex.tts_script.trim() ? { tts_script: ex.tts_script.trim() } : {}),
          ...(ex.tts_script_ar.trim() ? { tts_script_ar: ex.tts_script_ar.trim() } : {}),
          ...(instrLines.length ? { instructions: instrLines } : {}),
        };
      }),
    })),
  };
}

type ExRow = Record<string, unknown>;

export function PlanJsonEditor(props: {
  value: PlanJsonDraft;
  onChange: (next: PlanJsonDraft) => void;
  t: (ar: string, en: string) => string;
}) {
  const { value, onChange, t } = props;
  const [openSlots, setOpenSlots] = useState<Record<number, boolean>>({ 0: true });
  const [picker, setPicker] = useState<{ si: number; ei: number } | null>(null);
  const [exSearch, setExSearch] = useState("");
  const [exRows, setExRows] = useState<ExRow[]>([]);
  const [exLoading, setExLoading] = useState(false);

  const toggleSlot = useCallback((i: number) => {
    setOpenSlots((prev) => ({ ...prev, [i]: !prev[i] }));
  }, []);

  const updateSlot = useCallback(
    (si: number, patch: Partial<PlanSlotDraft>) => {
      const slots = [...value.slots];
      slots[si] = { ...slots[si], ...patch };
      onChange({ slots });
    },
    [onChange, value.slots],
  );

  const updateExercise = useCallback(
    (si: number, ei: number, patch: Partial<PlanExerciseDraft>) => {
      const slots = [...value.slots];
      const ex = [...slots[si].exercises];
      ex[ei] = { ...ex[ei], ...patch };
      slots[si] = { ...slots[si], exercises: ex };
      onChange({ slots });
    },
    [onChange, value.slots],
  );

  const addSlot = useCallback(() => {
    onChange({ slots: [...value.slots, newSlot()] });
    setOpenSlots((p) => ({ ...p, [value.slots.length]: true }));
  }, [onChange, value.slots]);

  const removeSlot = useCallback(
    (si: number) => {
      const slots = value.slots.filter((_, j) => j !== si);
      onChange({ slots: slots.length ? slots : [newSlot()] });
    },
    [onChange, value.slots],
  );

  const addExercise = useCallback(
    (si: number) => {
      const slots = [...value.slots];
      const ex = [...slots[si].exercises, newExercise(slots[si].exercises.length)];
      slots[si] = { ...slots[si], exercises: ex };
      onChange({ slots });
    },
    [onChange, value.slots],
  );

  const removeExercise = useCallback(
    (si: number, ei: number) => {
      const slots = [...value.slots];
      const ex = slots[si].exercises.filter((_, j) => j !== ei);
      slots[si] = { ...slots[si], exercises: ex.length ? ex : [newExercise(0)] };
      onChange({ slots });
    },
    [onChange, value.slots],
  );

  const uploadAudio = useCallback(
    async (si: number, ei: number, file: File) => {
      if (!db || !hasFirebaseConfig) return;
      await ensureStaffAuth();
      const path = `plans/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await db.storage.from("plan-exercise-audio").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = db.storage.from("plan-exercise-audio").getPublicUrl(path);
      updateExercise(si, ei, { audio_url: data.publicUrl });
    },
    [updateExercise],
  );

  const openPicker = useCallback(async (si: number, ei: number) => {
    setPicker({ si, ei });
    setExSearch("");
    if (!db || !hasFirebaseConfig) return;
    setExLoading(true);
    try {
      await ensureStaffAuth();
      const resp = await db
        .from("exercises")
        .select(
          "id,name,name_ar,minutes,calories,level,type,media_url,image_asset_path,audio_url,tts_script,tts_script_ar,instructions,media_type,exercise_steps,rating",
        )
        .order("name", { ascending: true })
        .limit(200);
      setExRows((resp.data ?? []) as ExRow[]);
    } finally {
      setExLoading(false);
    }
  }, []);

  const applyExerciseRow = useCallback(
    (row: ExRow) => {
      if (!picker) return;
      const { si, ei } = picker;
      const img =
        String(row.media_url ?? row.image_asset_path ?? "").trim();
      updateExercise(si, ei, {
        id: String(row.id ?? `imported-${ei}`),
        name: String(row.name ?? ""),
        name_ar: String(row.name_ar ?? row.name ?? ""),
        minutes: Number(row.minutes ?? 5) || 5,
        calories: Number(row.calories ?? 0) || 0,
        level: String(row.level ?? "beginner"),
        type: String(row.type ?? "home"),
        image_asset: img,
        steps: Number(row.exercise_steps ?? 1) || 1,
        rating: Number(row.rating ?? 4.5) || 4.5,
        audio_url: String(row.audio_url ?? ""),
        tts_script: String(row.tts_script ?? ""),
        tts_script_ar: String(row.tts_script_ar ?? ""),
        instructions: Array.isArray(row.instructions)
          ? (row.instructions as unknown[]).map(String).join("\n")
          : typeof row.instructions === "string"
            ? row.instructions
            : "",
        media_type: String(row.media_type ?? "image").toLowerCase() === "video" ? "video" : "image",
      });
      setPicker(null);
    },
    [picker, updateExercise],
  );

  const filteredPicker = useMemo(() => {
    const q = exSearch.trim().toLowerCase();
    if (!q) return exRows;
    return exRows.filter(
      (r) =>
        String(r.name ?? "")
          .toLowerCase()
          .includes(q) ||
        String(r.name_ar ?? "")
          .toLowerCase()
          .includes(q),
    );
  }, [exRows, exSearch]);

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border/60 bg-secondary/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[#F5EAD4]" style={{ fontSize: 13, fontWeight: 600 }}>
          {t("خطة اليوم (فترات وتمارين)", "Today's plan (slots & exercises)")}
        </p>
        <button
          type="button"
          onClick={addSlot}
          className="inline-flex items-center gap-1 rounded-lg border border-[#D4AF37]/40 px-2 py-1 text-xs text-[#D4AF37] hover:bg-[#D4AF37]/10"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("فترة", "Slot")}
        </button>
      </div>
      <p className="text-muted-foreground" style={{ fontSize: 11 }}>
        {t(
          "يُحفظ في json_plan ويظهر في التطبيق. مفتاح title_key اختياري للترجمة.",
          "Saved to json_plan and shown in the app. title_key is optional for i18n.",
        )}
      </p>

      {value.slots.map((slot, si) => {
        const open = openSlots[si] !== false;
        return (
          <div key={si} className="rounded-lg border border-border bg-card/80">
            <button
              type="button"
              onClick={() => toggleSlot(si)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start hover:bg-secondary/40"
            >
              <span className="text-[#F5EAD4]" style={{ fontSize: 13 }}>
                {t("فترة", "Slot")} {si + 1}
                {slot.time ? ` · ${slot.time}` : ""}
              </span>
              {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {open ? (
              <div className="space-y-2 border-t border-border/60 px-3 py-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    value={slot.title_key}
                    onChange={(e) => updateSlot(si, { title_key: e.target.value })}
                    placeholder="title_key (i18n)"
                    className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                    style={{ fontSize: 12 }}
                  />
                  <input
                    value={slot.time}
                    onChange={(e) => updateSlot(si, { time: e.target.value })}
                    placeholder={t("وقت", "Time")}
                    className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                    style={{ fontSize: 12 }}
                  />
                  <input
                    value={slot.title}
                    onChange={(e) => updateSlot(si, { title: e.target.value })}
                    placeholder={t("عنوان EN", "Title EN")}
                    className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                    style={{ fontSize: 12 }}
                  />
                  <input
                    value={slot.title_ar}
                    onChange={(e) => updateSlot(si, { title_ar: e.target.value })}
                    placeholder={t("عنوان AR", "Title AR")}
                    className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                    style={{ fontSize: 12 }}
                  />
                </div>
                <label className="flex items-center gap-2 text-muted-foreground" style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={slot.done} onChange={(e) => updateSlot(si, { done: e.target.checked })} />
                  {t("مكتمل", "Done")}
                </label>
                <textarea
                  value={slot.description}
                  onChange={(e) => updateSlot(si, { description: e.target.value })}
                  placeholder={t("وصف EN", "Description EN")}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                  style={{ fontSize: 12 }}
                  rows={2}
                />
                <textarea
                  value={slot.description_ar}
                  onChange={(e) => updateSlot(si, { description_ar: e.target.value })}
                  placeholder={t("وصف AR", "Description AR")}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                  style={{ fontSize: 12 }}
                  rows={2}
                />

                <div className="pt-2 text-muted-foreground" style={{ fontSize: 11 }}>
                  {t("تمارين الفترة", "Slot exercises")}
                </div>
                {slot.exercises.map((ex, ei) => (
                  <div key={ei} className="rounded-md border border-border/70 bg-background/40 p-2">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openPicker(si, ei)}
                        className="inline-flex items-center gap-1 rounded border border-[#D4AF37]/30 px-2 py-1 text-[11px] text-[#D4AF37] hover:bg-[#D4AF37]/10"
                      >
                        <Wand2 className="h-3 w-3" />
                        {t("من exercises", "From exercises")}
                      </button>
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary/50">
                        <Upload className="h-3 w-3" />
                        {t("رفع صوت", "Upload audio")}
                        <input
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (!f) return;
                            try {
                              await uploadAudio(si, ei, f);
                            } catch (err) {
                              console.error(err);
                              window.alert(String((err as Error)?.message ?? err));
                            }
                          }}
                        />
                      </label>
                      {slot.exercises.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeExercise(si, ei)}
                          className="ms-auto inline-flex items-center gap-1 text-[11px] text-red-300 hover:underline"
                        >
                          <Trash2 className="h-3 w-3" />
                          {t("حذف تمرين", "Remove exercise")}
                        </button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={ex.name}
                        onChange={(e) => updateExercise(si, ei, { name: e.target.value })}
                        placeholder="name"
                        className="rounded border border-border bg-background px-2 py-1 text-[#F5EAD4]"
                        style={{ fontSize: 12 }}
                      />
                      <input
                        value={ex.name_ar}
                        onChange={(e) => updateExercise(si, ei, { name_ar: e.target.value })}
                        placeholder="name_ar"
                        className="rounded border border-border bg-background px-2 py-1 text-[#F5EAD4]"
                        style={{ fontSize: 12 }}
                      />
                      <input
                        type="number"
                        value={ex.minutes}
                        onChange={(e) => updateExercise(si, ei, { minutes: Number(e.target.value) || 1 })}
                        className="rounded border border-border bg-background px-2 py-1 text-[#F5EAD4]"
                        style={{ fontSize: 12 }}
                      />
                      <input
                        type="number"
                        value={ex.calories}
                        onChange={(e) => updateExercise(si, ei, { calories: Number(e.target.value) || 0 })}
                        className="rounded border border-border bg-background px-2 py-1 text-[#F5EAD4]"
                        style={{ fontSize: 12 }}
                      />
                      <input
                        value={ex.image_asset}
                        onChange={(e) => updateExercise(si, ei, { image_asset: e.target.value })}
                        placeholder={t("رابط صورة/GIF أو مسار asset", "Image/GIF URL or asset path")}
                        className="sm:col-span-2 rounded border border-border bg-background px-2 py-1 text-[#F5EAD4]"
                        style={{ fontSize: 12 }}
                      />
                      <input
                        value={ex.audio_url}
                        onChange={(e) => updateExercise(si, ei, { audio_url: e.target.value })}
                        placeholder="audio_url"
                        className="sm:col-span-2 rounded border border-border bg-background px-2 py-1 text-[#F5EAD4]"
                        style={{ fontSize: 12 }}
                      />
                      <textarea
                        value={ex.tts_script}
                        onChange={(e) => updateExercise(si, ei, { tts_script: e.target.value })}
                        placeholder="TTS EN"
                        className="rounded border border-border bg-background px-2 py-1 text-[#F5EAD4]"
                        style={{ fontSize: 12 }}
                        rows={2}
                      />
                      <textarea
                        value={ex.tts_script_ar}
                        onChange={(e) => updateExercise(si, ei, { tts_script_ar: e.target.value })}
                        placeholder="TTS AR"
                        className="rounded border border-border bg-background px-2 py-1 text-[#F5EAD4]"
                        style={{ fontSize: 12 }}
                        rows={2}
                      />
                      <select
                        value={ex.media_type}
                        onChange={(e) =>
                          updateExercise(si, ei, { media_type: e.target.value === "video" ? "video" : "image" })
                        }
                        className="rounded border border-border bg-background px-2 py-1 text-[#F5EAD4]"
                        style={{ fontSize: 12 }}
                      >
                        <option value="image">image</option>
                        <option value="video">video</option>
                      </select>
                      <input
                        value={ex.level}
                        onChange={(e) => updateExercise(si, ei, { level: e.target.value })}
                        placeholder="level"
                        className="rounded border border-border bg-background px-2 py-1 text-[#F5EAD4]"
                        style={{ fontSize: 12 }}
                      />
                    </div>
                    <textarea
                      value={ex.instructions}
                      onChange={(e) => updateExercise(si, ei, { instructions: e.target.value })}
                      placeholder={t("تعليمات (سطر لكل بند)", "Instructions (one line each)")}
                      className="mt-2 w-full rounded border border-border bg-background px-2 py-1 text-[#F5EAD4]"
                      style={{ fontSize: 12 }}
                      rows={3}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addExercise(si)}
                  className="text-[11px] text-[#D4AF37] hover:underline"
                >
                  + {t("تمرين", "Exercise")}
                </button>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => removeSlot(si)}
                    className="inline-flex items-center gap-1 text-[11px] text-red-300 hover:underline"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t("حذف الفترة", "Remove slot")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {picker ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setPicker(null)} aria-label="close" />
          <div className="relative z-10 max-h-[80vh] w-[min(520px,92vw)] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            <div className="border-b border-border p-3">
              <p className="text-[#F5EAD4]" style={{ fontSize: 14 }}>
                {t("اختر تمرينًا", "Pick an exercise")}
              </p>
              <input
                value={exSearch}
                onChange={(e) => setExSearch(e.target.value)}
                placeholder={t("بحث…", "Search…")}
                className="mt-2 w-full rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                style={{ fontSize: 12 }}
              />
            </div>
            <div className="max-h-[55vh] overflow-y-auto">
              {exLoading ? (
                <p className="p-3 text-muted-foreground" style={{ fontSize: 12 }}>
                  {t("جاري التحميل…", "Loading…")}
                </p>
              ) : null}
              {filteredPicker.map((row) => (
                <button
                  key={String(row.id)}
                  type="button"
                  onClick={() => applyExerciseRow(row)}
                  className="flex w-full flex-col items-start border-b border-border/60 px-3 py-2 text-start hover:bg-secondary/50"
                >
                  <span className="text-[#F5EAD4]" style={{ fontSize: 13 }}>
                    {String(row.name ?? "")}
                  </span>
                  <span className="text-muted-foreground" style={{ fontSize: 11 }}>
                    {String(row.name_ar ?? "")}
                  </span>
                </button>
              ))}
              {!exLoading && filteredPicker.length === 0 ? (
                <p className="p-3 text-muted-foreground" style={{ fontSize: 12 }}>
                  {t("لا نتائج", "No results")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
