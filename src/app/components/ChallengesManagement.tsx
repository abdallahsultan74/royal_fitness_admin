import { useCallback, useEffect, useState } from "react";
import { ImagePlus, Plus, Save, Trash2, Trophy, Upload } from "lucide-react";
import { useLang } from "./LanguageContext";
import { db, ensureStaffAuth, hasFirebaseConfig } from "../firebase";

const COVERS_BUCKET = "challenge-covers";
const MAX_COVER_BYTES = 4 * 1024 * 1024;

type ChallengeTemplateRow = {
  id: string;
  slug: string;
  title: string;
  title_ar: string | null;
  description: string | null;
  description_ar: string | null;
  level: string;
  days_count: number;
  cover_image_url: string | null;
  is_active: boolean;
};

type DayRow = {
  id: number;
  day_number: number;
  title: string;
  title_ar: string | null;
  target_minutes: number;
  target_exercises: number;
  target_calories: number;
  notes: string | null;
  notes_ar: string | null;
};

function levelLabel(lang: string, lv: string): string {
  const m: Record<string, { ar: string; en: string }> = {
    beginner: { ar: "مبتدئ", en: "Beginner" },
    intermediate: { ar: "متوسط", en: "Intermediate" },
    advanced: { ar: "متقدم", en: "Advanced" },
  };
  return (lang === "ar" ? m[lv]?.ar : m[lv]?.en) ?? lv;
}

function suggestSlug(title: string): string {
  const s = title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return s.length > 0 ? s.slice(0, 96) : `challenge-${Date.now()}`;
}

function coverObjectPathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${COVERS_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  try {
    return decodeURIComponent(url.slice(i + marker.length));
  } catch {
    return null;
  }
}

export function ChallengesManagement() {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<ChallengeTemplateRow[]>([]);
  const [days, setDays] = useState<DayRow[]>([]);
  const [selected, setSelected] = useState<ChallengeTemplateRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [daysLoading, setDaysLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const [title, setTitle] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [desc, setDesc] = useState("");
  const [descAr, setDescAr] = useState("");
  const [level, setLevel] = useState("beginner");
  const [daysCount, setDaysCount] = useState(30);
  const [coverUrl, setCoverUrl] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [dayEditing, setDayEditing] = useState<DayRow | null>(null);
  const [daySaving, setDaySaving] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFrom, setBulkFrom] = useState(1);
  const [bulkTo, setBulkTo] = useState(7);
  const [bulkTitleEn, setBulkTitleEn] = useState("Day {n}");
  const [bulkTitleAr, setBulkTitleAr] = useState("اليوم {n}");
  const [bulkMin, setBulkMin] = useState(30);
  const [bulkEx, setBulkEx] = useState(5);
  const [bulkCal, setBulkCal] = useState(200);
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkNotesAr, setBulkNotesAr] = useState("");
  const [bulkWorking, setBulkWorking] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newTitleAr, setNewTitleAr] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDescAr, setNewDescAr] = useState("");
  const [newLevel, setNewLevel] = useState("beginner");
  const [newDaysCount, setNewDaysCount] = useState(30);
  const [newActive, setNewActive] = useState(true);
  const [newWorking, setNewWorking] = useState(false);

  const [coverUploading, setCoverUploading] = useState(false);

  const loadTemplates = useCallback(async () => {
    if (!db || !hasFirebaseConfig) {
      setLive(false);
      setRows([]);
      return;
    }
    setLoading(true);
    setAuthError(null);
    try {
      const ok = await ensureStaffAuth();
      if (!ok) {
        setLive(false);
        setRows([]);
        return;
      }
      const resp = await db.from("challenge_templates").select("*").order("level", { ascending: true });
      if (resp.error) {
        setAuthError(resp.error.message);
        setLive(false);
        setRows([]);
        return;
      }
      setLive(true);
      setRows((resp.data ?? []) as ChallengeTemplateRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDays = useCallback(async (challengeId: string) => {
    if (!db || !hasFirebaseConfig) return;
    setDaysLoading(true);
    try {
      const resp = await db
        .from("challenge_template_days")
        .select("id, day_number, title, title_ar, target_minutes, target_exercises, target_calories, notes, notes_ar")
        .eq("challenge_id", challengeId)
        .order("day_number", { ascending: true });
      if (resp.error) {
        setDays([]);
        setAuthError(resp.error.message);
        return;
      }
      setDays((resp.data ?? []) as DayRow[]);
    } finally {
      setDaysLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const selectRow = (r: ChallengeTemplateRow) => {
    setSelected(r);
    setTitle(r.title);
    setTitleAr(r.title_ar ?? "");
    setDesc(r.description ?? "");
    setDescAr(r.description_ar ?? "");
    setLevel(r.level);
    setDaysCount(r.days_count);
    setCoverUrl(r.cover_image_url ?? "");
    setIsActive(r.is_active);
    void loadDays(r.id);
  };

  const syncDayRowsAfterCountChange = async (challengeId: string, oldCount: number, newCount: number) => {
    if (!db || oldCount === newCount) return;
    if (newCount < oldCount) {
      const ok = window.confirm(
        t(
          `سيتم حذف أيام ${newCount + 1} إلى ${oldCount} من القالب. المتابعة؟`,
          `Days ${newCount + 1}–${oldCount} will be deleted from this template. Continue?`,
        ),
      );
      if (!ok) throw new Error("cancelled");
      const { error } = await db
        .from("challenge_template_days")
        .delete()
        .eq("challenge_id", challengeId)
        .gt("day_number", newCount);
      if (error) throw new Error(error.message);
    }
    if (newCount > oldCount) {
      const inserts = [];
      for (let n = oldCount + 1; n <= newCount; n++) {
        inserts.push({
          challenge_id: challengeId,
          day_number: n,
          title: `Day ${n}`,
          title_ar: `اليوم ${n}`,
          target_minutes: 30,
          target_exercises: 5,
          target_calories: 200,
          notes: null,
          notes_ar: null,
        });
      }
      const { error } = await db.from("challenge_template_days").insert(inserts);
      if (error) throw new Error(error.message);
    }
  };

  const save = async () => {
    if (!selected || !db || !hasFirebaseConfig) return;
    setSaving(true);
    setAuthError(null);
    try {
      await ensureStaffAuth();
      const oldCount = selected.days_count;
      const newCount = Math.max(1, Math.min(365, Math.floor(daysCount)));
      if (newCount !== oldCount) {
        try {
          await syncDayRowsAfterCountChange(selected.id, oldCount, newCount);
        } catch (e) {
          if ((e as Error).message === "cancelled") {
            setDaysCount(oldCount);
            return;
          }
          setAuthError((e as Error).message);
          return;
        }
      }
      const { error } = await db
        .from("challenge_templates")
        .update({
          title: title.trim(),
          title_ar: titleAr.trim() || null,
          description: desc.trim() || null,
          description_ar: descAr.trim() || null,
          level,
          days_count: newCount,
          cover_image_url: coverUrl.trim() || null,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selected.id);
      if (error) {
        setAuthError(error.message);
        return;
      }
      const next: ChallengeTemplateRow = {
        ...selected,
        title: title.trim(),
        title_ar: titleAr.trim() || null,
        description: desc.trim() || null,
        description_ar: descAr.trim() || null,
        level,
        days_count: newCount,
        cover_image_url: coverUrl.trim() || null,
        is_active: isActive,
      };
      setRows((prev) => prev.map((r) => (r.id === selected.id ? next : r)));
      setSelected(next);
      setDaysCount(newCount);
      await loadDays(selected.id);
    } finally {
      setSaving(false);
    }
  };

  const uploadCover = async (file: File) => {
    if (!selected || !db || !hasFirebaseConfig) return;
    if (!file.type.startsWith("image/")) {
      setAuthError(t("اختر ملف صورة.", "Pick an image file."));
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setAuthError(t("الصورة كبيرة جداً (حد أقصى 4 ميجا).", "Image too large (max 4 MB)."));
      return;
    }
    setCoverUploading(true);
    setAuthError(null);
    try {
      await ensureStaffAuth();
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${selected.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await db.storage.from(COVERS_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (upErr) {
        setAuthError(upErr.message);
        return;
      }
      const { data: pub } = db.storage.from(COVERS_BUCKET).getPublicUrl(path);
      const url = pub?.publicUrl ?? "";
      if (!url) {
        setAuthError(t("لم يُبنَ رابط عام للصورة.", "Could not build public URL."));
        return;
      }
      setCoverUrl(url);
    } finally {
      setCoverUploading(false);
    }
  };

  const clearCover = async () => {
    if (!selected || !db) return;
    const url = coverUrl.trim();
    if (url) {
      const path = coverObjectPathFromPublicUrl(url);
      if (path) {
        await db.storage.from(COVERS_BUCKET).remove([path]).catch(() => undefined);
      }
    }
    setCoverUrl("");
  };

  const saveDayEdit = async (patch: Partial<DayRow> & { id: number }) => {
    if (!db || !selected) return;
    setDaySaving(true);
    setAuthError(null);
    try {
      await ensureStaffAuth();
      const { id, ...rest } = patch;
      const { error } = await db
        .from("challenge_template_days")
        .update({
          title: rest.title?.trim() ?? "",
          title_ar: rest.title_ar?.trim() || null,
          target_minutes: Math.max(0, Math.floor(Number(rest.target_minutes) || 0)),
          target_exercises: Math.max(0, Math.floor(Number(rest.target_exercises) || 0)),
          target_calories: Math.max(0, Math.floor(Number(rest.target_calories) || 0)),
          notes: rest.notes?.trim() || null,
          notes_ar: rest.notes_ar?.trim() || null,
        })
        .eq("id", id);
      if (error) {
        setAuthError(error.message);
        return;
      }
      setDayEditing(null);
      await loadDays(selected.id);
    } finally {
      setDaySaving(false);
    }
  };

  const applyBulk = async () => {
    if (!db || !selected) return;
    const from = Math.max(1, Math.floor(bulkFrom));
    const to = Math.max(from, Math.floor(bulkTo));
    setBulkWorking(true);
    setAuthError(null);
    try {
      await ensureStaffAuth();
      for (let n = from; n <= to; n++) {
        const row = days.find((d) => d.day_number === n);
        if (!row) continue;
        const titleEn = bulkTitleEn.replace(/\{n\}/g, String(n));
        const titleArR = bulkTitleAr.replace(/\{n\}/g, String(n));
        const { error } = await db
          .from("challenge_template_days")
          .update({
            title: titleEn,
            title_ar: titleArR || null,
            target_minutes: Math.max(0, bulkMin),
            target_exercises: Math.max(0, bulkEx),
            target_calories: Math.max(0, bulkCal),
            notes: bulkNotes.trim() || null,
            notes_ar: bulkNotesAr.trim() || null,
          })
          .eq("id", row.id);
        if (error) {
          setAuthError(error.message);
          return;
        }
      }
      setBulkOpen(false);
      await loadDays(selected.id);
    } finally {
      setBulkWorking(false);
    }
  };

  const createChallenge = async () => {
    if (!db || !hasFirebaseConfig) return;
    const slug = (newSlug.trim() || suggestSlug(newTitle)).toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setAuthError(t("slug: أحرف صغيرة وأرقام وشرطة فقط.", "slug: lowercase letters, digits, and hyphen only."));
      return;
    }
    setNewWorking(true);
    setAuthError(null);
    try {
      await ensureStaffAuth();
      const { data, error } = await db
        .from("challenge_templates")
        .insert({
          slug,
          title: newTitle.trim() || slug,
          title_ar: newTitleAr.trim() || null,
          description: newDesc.trim() || null,
          description_ar: newDescAr.trim() || null,
          level: newLevel,
          days_count: Math.max(1, Math.min(365, Math.floor(newDaysCount))),
          cover_image_url: null,
          is_active: newActive,
        })
        .select("*")
        .single();
      if (error) {
        setAuthError(error.message);
        return;
      }
      const row = data as ChallengeTemplateRow;
      const dc = row.days_count;
      const dayInserts = [];
      for (let n = 1; n <= dc; n++) {
        dayInserts.push({
          challenge_id: row.id,
          day_number: n,
          title: `Day ${n}`,
          title_ar: `اليوم ${n}`,
          target_minutes: 30,
          target_exercises: 5,
          target_calories: 200,
          notes: null,
          notes_ar: null,
        });
      }
      const { error: dErr } = await db.from("challenge_template_days").insert(dayInserts);
      if (dErr) {
        setAuthError(dErr.message);
        return;
      }
      setRows((prev) => [...prev, row].sort((a, b) => a.level.localeCompare(b.level)));
      setNewOpen(false);
      setNewSlug("");
      setNewTitle("");
      setNewTitleAr("");
      setNewDesc("");
      setNewDescAr("");
      setNewLevel("beginner");
      setNewDaysCount(30);
      setNewActive(true);
      selectRow(row);
    } finally {
      setNewWorking(false);
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="flex items-center gap-2 text-xl text-[#F5EAD4] sm:text-2xl">
            <Trophy className="h-6 w-6 text-[#D4AF37]" />
            {t("التحديات (نيتف)", "Native challenges")}
          </h1>
          <button
            type="button"
            disabled={!live}
            onClick={() => {
              setNewOpen(true);
              setNewSlug("");
              setNewTitle("");
              setNewTitleAr("");
              setNewDesc("");
              setNewDescAr("");
              setNewLevel("beginner");
              setNewDaysCount(30);
              setNewActive(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-2 text-[#D4AF37] hover:bg-[#D4AF37]/20 disabled:opacity-40"
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            <Plus className="h-4 w-4" />
            {t("تحدي جديد", "New challenge")}
          </button>
        </div>
        <p className="text-muted-foreground text-sm sm:text-[14px]">
          {t(
            "تعديل عناوين ووصف وصورة الغلاف ومدة التحديات المعرفة في قاعدة البيانات (يظهر للمستخدم في التطبيق).",
            "Edit titles, descriptions, cover image, and metadata for database-defined challenges (shown in the app).",
          )}{" "}
          <span className={live ? "text-emerald-400" : "text-amber-400"}>
            {live ? t("متصل", "Live") : t("غير متصل", "Offline")}
          </span>
        </p>
        {authError ? (
          <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-300" style={{ fontSize: 13 }}>
            {authError}
          </div>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-muted-foreground" style={{ fontSize: 12 }}>
            {t("قوالب التحدي", "Challenge templates")}
          </p>
          {loading ? (
            <p className="text-muted-foreground text-sm">{t("جاري التحميل…", "Loading…")}</p>
          ) : (
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => selectRow(r)}
                    className={`w-full rounded-lg border px-3 py-2 text-start transition-colors ${
                      selected?.id === r.id
                        ? "border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#F5EAD4]"
                        : "border-transparent hover:bg-secondary"
                    }`}
                    style={{ fontSize: 13 }}
                  >
                    <span className="block font-medium">{r.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {r.slug} · {levelLabel(lang, r.level)} · {r.days_count}d
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {!selected ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
              {t("اختر تحديًا من القائمة لتعديله.", "Pick a challenge from the list to edit.")}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-card space-y-3 p-4">
                <p className="text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 600 }}>
                  {t("بيانات القالب", "Template")}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-muted-foreground text-xs">{t("المعرّف (slug)", "Slug (read-only)")}</label>
                  <input
                    readOnly
                    value={selected.slug}
                    dir="ltr"
                    lang="en"
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-left text-muted-foreground sm:col-span-2"
                    style={{ fontSize: 13 }}
                  />
                  <label className="text-muted-foreground text-xs">{t("العنوان (EN)", "Title (EN)")}</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    dir="ltr"
                    lang="en"
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-left text-[#F5EAD4] sm:col-span-2"
                    style={{ fontSize: 13 }}
                  />
                  <label className="text-muted-foreground text-xs">{t("العنوان (عربي)", "Title (AR)")}</label>
                  <input
                    value={titleAr}
                    onChange={(e) => setTitleAr(e.target.value)}
                    dir="rtl"
                    lang="ar"
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-right text-[#F5EAD4] sm:col-span-2"
                    style={{ fontSize: 13 }}
                  />
                  <label className="text-muted-foreground text-xs">{t("الوصف (EN)", "Description (EN)")}</label>
                  <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    rows={3}
                    dir="ltr"
                    lang="en"
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-left text-[#F5EAD4] sm:col-span-2"
                    style={{ fontSize: 13 }}
                  />
                  <label className="text-muted-foreground text-xs">{t("الوصف (عربي)", "Description (AR)")}</label>
                  <textarea
                    value={descAr}
                    onChange={(e) => setDescAr(e.target.value)}
                    rows={3}
                    dir="rtl"
                    lang="ar"
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-right text-[#F5EAD4] sm:col-span-2"
                    style={{ fontSize: 13 }}
                  />
                  <label className="text-muted-foreground text-xs">{t("المستوى", "Level")}</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    dir="ltr"
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-left text-[#F5EAD4] sm:col-span-2"
                    style={{ fontSize: 13 }}
                  >
                    <option value="beginner">beginner</option>
                    <option value="intermediate">intermediate</option>
                    <option value="advanced">advanced</option>
                  </select>
                  <label className="text-muted-foreground text-xs">{t("عدد الأيام", "Days count")}</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={daysCount}
                    onChange={(e) => setDaysCount(Number(e.target.value) || 30)}
                    dir="ltr"
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-left text-[#F5EAD4] sm:col-span-2"
                    style={{ fontSize: 13 }}
                  />

                  <label className="text-muted-foreground text-xs sm:col-span-2">
                    {t("غلاف التحدي", "Cover image")}
                  </label>
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-[#F5EAD4] hover:bg-secondary/80">
                        <Upload className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                        <span style={{ fontSize: 13 }}>{coverUploading ? t("جاري الرفع…", "Uploading…") : t("رفع صورة", "Upload image")}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={coverUploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) void uploadCover(f);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={!coverUrl.trim()}
                        onClick={() => void clearCover()}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                        style={{ fontSize: 13 }}
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("إزالة الغلاف", "Remove cover")}
                      </button>
                    </div>
                    {coverUrl.trim() ? (
                      <div className="mt-1 flex flex-wrap items-start gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={coverUrl.trim()}
                          alt=""
                          className="max-h-32 max-w-[220px] rounded-lg border border-border object-cover"
                        />
                      </div>
                    ) : null}
                    <label className="text-muted-foreground text-xs">{t("أو الصق رابط HTTPS", "Or paste HTTPS URL")}</label>
                    <input
                      value={coverUrl}
                      onChange={(e) => setCoverUrl(e.target.value)}
                      placeholder="https://..."
                      dir="ltr"
                      lang="en"
                      className="rounded-lg border border-border bg-secondary px-3 py-2 text-left text-[#F5EAD4]"
                      style={{ fontSize: 13 }}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-muted-foreground text-xs sm:col-span-2">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    {t("نشط في التطبيق", "Active in app")}
                  </label>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-[#012217] hover:bg-[#c9a430] disabled:opacity-50"
                  style={{ fontSize: 14, fontWeight: 600 }}
                >
                  <Save className="h-4 w-4" />
                  {t("حفظ القالب", "Save template")}
                </button>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 600 }}>
                    {t("خطة الأيام", "Day plan")}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkFrom(1);
                      setBulkTo(Math.min(7, days.length || 7));
                      setBulkOpen(true);
                    }}
                    className="rounded-lg border border-[#D4AF37]/40 px-3 py-1.5 text-[#D4AF37] hover:bg-[#D4AF37]/10"
                    style={{ fontSize: 12 }}
                  >
                    {t("تعبئة نطاق أيام", "Bulk fill days")}
                  </button>
                </div>
                <p className="mb-3 text-muted-foreground" style={{ fontSize: 12 }}>
                  {t("عدّل كل يوم من زر التعديل، أو طبّق قيماً على نطاق من الأيام.", "Edit each day via Edit, or apply values to a day range.")}
                </p>
                {daysLoading ? (
                  <p className="text-muted-foreground text-sm">{t("جاري تحميل الأيام…", "Loading days…")}</p>
                ) : (
                  <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
                    <table className="w-full min-w-[720px] text-start text-sm">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2" dir="ltr">
                            EN
                          </th>
                          <th className="px-2 py-2" dir="rtl">
                            AR
                          </th>
                          <th className="px-2 py-2">min</th>
                          <th className="px-2 py-2">ex</th>
                          <th className="px-2 py-2">kcal</th>
                          <th className="px-2 py-2">{t("إجراء", "Action")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {days.map((d) => (
                          <tr key={d.id} className="border-b border-border/40">
                            <td className="px-2 py-1.5 text-[#F5EAD4]">{d.day_number}</td>
                            <td dir="ltr" className="max-w-[200px] truncate px-2 py-1.5 text-left text-muted-foreground">
                              {d.title}
                            </td>
                            <td dir="rtl" className="max-w-[200px] truncate px-2 py-1.5 text-right text-muted-foreground">
                              {d.title_ar ?? "—"}
                            </td>
                            <td className="px-2 py-1.5">{d.target_minutes}</td>
                            <td className="px-2 py-1.5">{d.target_exercises}</td>
                            <td className="px-2 py-1.5">{d.target_calories}</td>
                            <td className="px-2 py-1.5">
                              <button
                                type="button"
                                onClick={() => setDayEditing({ ...d })}
                                className="rounded border border-border px-2 py-1 text-xs text-[#D4AF37] hover:bg-secondary"
                              >
                                {t("تعديل", "Edit")}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {dayEditing ? (
        <DayEditModal
          key={dayEditing.id}
          t={t}
          row={dayEditing}
          saving={daySaving}
          onClose={() => setDayEditing(null)}
          onSave={(patch) => void saveDayEdit(patch)}
        />
      ) : null}

      {bulkOpen && selected ? (
        <BulkModal
          t={t}
          maxDay={days.length || 1}
          bulkFrom={bulkFrom}
          bulkTo={bulkTo}
          setBulkFrom={setBulkFrom}
          setBulkTo={setBulkTo}
          bulkTitleEn={bulkTitleEn}
          setBulkTitleEn={setBulkTitleEn}
          bulkTitleAr={bulkTitleAr}
          setBulkTitleAr={setBulkTitleAr}
          bulkMin={bulkMin}
          setBulkMin={setBulkMin}
          bulkEx={bulkEx}
          setBulkEx={setBulkEx}
          bulkCal={bulkCal}
          setBulkCal={setBulkCal}
          bulkNotes={bulkNotes}
          setBulkNotes={setBulkNotes}
          bulkNotesAr={bulkNotesAr}
          setBulkNotesAr={setBulkNotesAr}
          working={bulkWorking}
          onClose={() => setBulkOpen(false)}
          onApply={() => void applyBulk()}
        />
      ) : null}

      {newOpen ? (
        <NewChallengeModal
          t={t}
          newSlug={newSlug}
          setNewSlug={setNewSlug}
          newTitle={newTitle}
          setNewTitle={setNewTitle}
          newTitleAr={newTitleAr}
          setNewTitleAr={setNewTitleAr}
          newDesc={newDesc}
          setNewDesc={setNewDesc}
          newDescAr={newDescAr}
          setNewDescAr={setNewDescAr}
          newLevel={newLevel}
          setNewLevel={setNewLevel}
          newDaysCount={newDaysCount}
          setNewDaysCount={setNewDaysCount}
          newActive={newActive}
          setNewActive={setNewActive}
          working={newWorking}
          onSuggestSlug={() => setNewSlug(suggestSlug(newTitle))}
          onClose={() => setNewOpen(false)}
          onCreate={() => void createChallenge()}
        />
      ) : null}
    </div>
  );
}

function DayEditModal({
  t,
  row,
  saving,
  onClose,
  onSave,
}: {
  t: (ar: string, en: string) => string;
  row: DayRow;
  saving: boolean;
  onClose: () => void;
  onSave: (p: Partial<DayRow> & { id: number }) => void;
}) {
  const [title, setTitle] = useState(row.title);
  const [titleAr, setTitleAr] = useState(row.title_ar ?? "");
  const [tm, setTm] = useState(row.target_minutes);
  const [ex, setEx] = useState(row.target_exercises);
  const [cal, setCal] = useState(row.target_calories);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [notesAr, setNotesAr] = useState(row.notes_ar ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-[#F5EAD4]" style={{ fontSize: 16, fontWeight: 600 }}>
          {t("تعديل اليوم", "Edit day")} #{row.day_number}
        </p>
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs">{t("عنوان EN", "Title EN")}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            dir="ltr"
            lang="en"
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-left text-[#F5EAD4]"
            style={{ fontSize: 13 }}
          />
          <label className="text-muted-foreground text-xs">{t("عنوان AR", "Title AR")}</label>
          <input
            value={titleAr}
            onChange={(e) => setTitleAr(e.target.value)}
            dir="rtl"
            lang="ar"
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-right text-[#F5EAD4]"
            style={{ fontSize: 13 }}
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-muted-foreground text-xs">min</label>
              <input
                type="number"
                value={tm}
                onChange={(e) => setTm(Number(e.target.value))}
                dir="ltr"
                className="w-full rounded-lg border border-border bg-secondary px-2 py-2 text-left"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-xs">ex</label>
              <input
                type="number"
                value={ex}
                onChange={(e) => setEx(Number(e.target.value))}
                dir="ltr"
                className="w-full rounded-lg border border-border bg-secondary px-2 py-2 text-left"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-xs">kcal</label>
              <input
                type="number"
                value={cal}
                onChange={(e) => setCal(Number(e.target.value))}
                dir="ltr"
                className="w-full rounded-lg border border-border bg-secondary px-2 py-2 text-left"
              />
            </div>
          </div>
          <label className="text-muted-foreground text-xs">{t("ملاحظات EN", "Notes EN")}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            dir="ltr"
            lang="en"
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-left text-[#F5EAD4]"
            style={{ fontSize: 13 }}
          />
          <label className="text-muted-foreground text-xs">{t("ملاحظات AR", "Notes AR")}</label>
          <textarea
            value={notesAr}
            onChange={(e) => setNotesAr(e.target.value)}
            rows={2}
            dir="rtl"
            lang="ar"
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-right text-[#F5EAD4]"
            style={{ fontSize: 13 }}
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-muted-foreground">
            {t("إلغاء", "Cancel")}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onSave({
                id: row.id,
                title,
                title_ar: titleAr,
                target_minutes: tm,
                target_exercises: ex,
                target_calories: cal,
                notes,
                notes_ar: notesAr,
              })
            }
            className="rounded-lg bg-[#D4AF37] px-4 py-2 text-[#012217] disabled:opacity-50"
          >
            {saving ? t("جاري الحفظ…", "Saving…") : t("حفظ", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkModal({
  t,
  maxDay,
  bulkFrom,
  bulkTo,
  setBulkFrom,
  setBulkTo,
  bulkTitleEn,
  setBulkTitleEn,
  bulkTitleAr,
  setBulkTitleAr,
  bulkMin,
  setBulkMin,
  bulkEx,
  setBulkEx,
  bulkCal,
  setBulkCal,
  bulkNotes,
  setBulkNotes,
  bulkNotesAr,
  setBulkNotesAr,
  working,
  onClose,
  onApply,
}: {
  t: (ar: string, en: string) => string;
  maxDay: number;
  bulkFrom: number;
  bulkTo: number;
  setBulkFrom: (n: number) => void;
  setBulkTo: (n: number) => void;
  bulkTitleEn: string;
  setBulkTitleEn: (s: string) => void;
  bulkTitleAr: string;
  setBulkTitleAr: (s: string) => void;
  bulkMin: number;
  setBulkMin: (n: number) => void;
  bulkEx: number;
  setBulkEx: (n: number) => void;
  bulkCal: number;
  setBulkCal: (n: number) => void;
  bulkNotes: string;
  setBulkNotes: (s: string) => void;
  bulkNotesAr: string;
  setBulkNotesAr: (s: string) => void;
  working: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-2 text-[#F5EAD4]" style={{ fontSize: 16, fontWeight: 600 }}>
          {t("تعبئة نطاق أيام", "Bulk fill days")}
        </p>
        <p className="mb-3 text-muted-foreground" style={{ fontSize: 12 }}>
          {t("يُستبدل عنوان كل يوم باستخدام {n} كرقم اليوم.", "Each day title uses {n} as the day number.")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-muted-foreground text-xs">{t("من يوم", "From day")}</label>
            <input
              type="number"
              min={1}
              max={maxDay}
              value={bulkFrom}
              onChange={(e) => setBulkFrom(Number(e.target.value) || 1)}
              dir="ltr"
              className="w-full rounded-lg border border-border bg-secondary px-2 py-2 text-left"
            />
          </div>
          <div>
            <label className="text-muted-foreground text-xs">{t("إلى يوم", "To day")}</label>
            <input
              type="number"
              min={1}
              max={maxDay}
              value={bulkTo}
              onChange={(e) => setBulkTo(Number(e.target.value) || 1)}
              dir="ltr"
              className="w-full rounded-lg border border-border bg-secondary px-2 py-2 text-left"
            />
          </div>
        </div>
        <label className="mt-2 block text-muted-foreground text-xs">Title EN ({`{n}`})</label>
        <input
          value={bulkTitleEn}
          onChange={(e) => setBulkTitleEn(e.target.value)}
          dir="ltr"
          lang="en"
          className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-left text-[#F5EAD4]"
        />
        <label className="mt-2 block text-muted-foreground text-xs">Title AR ({`{n}`})</label>
        <input
          value={bulkTitleAr}
          onChange={(e) => setBulkTitleAr(e.target.value)}
          dir="rtl"
          lang="ar"
          className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-right text-[#F5EAD4]"
        />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div>
            <label className="text-muted-foreground text-xs">min</label>
            <input
              type="number"
              value={bulkMin}
              onChange={(e) => setBulkMin(Number(e.target.value))}
              dir="ltr"
              className="w-full rounded-lg border border-border bg-secondary px-2 py-2 text-left"
            />
          </div>
          <div>
            <label className="text-muted-foreground text-xs">ex</label>
            <input
              type="number"
              value={bulkEx}
              onChange={(e) => setBulkEx(Number(e.target.value))}
              dir="ltr"
              className="w-full rounded-lg border border-border bg-secondary px-2 py-2 text-left"
            />
          </div>
          <div>
            <label className="text-muted-foreground text-xs">kcal</label>
            <input
              type="number"
              value={bulkCal}
              onChange={(e) => setBulkCal(Number(e.target.value))}
              dir="ltr"
              className="w-full rounded-lg border border-border bg-secondary px-2 py-2 text-left"
            />
          </div>
        </div>
        <label className="mt-2 block text-muted-foreground text-xs">{t("ملاحظات EN (مشتركة)", "Notes EN (shared)")}</label>
        <textarea
          value={bulkNotes}
          onChange={(e) => setBulkNotes(e.target.value)}
          rows={2}
          dir="ltr"
          className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-left"
        />
        <label className="mt-2 block text-muted-foreground text-xs">{t("ملاحظات AR (مشتركة)", "Notes AR (shared)")}</label>
        <textarea
          value={bulkNotesAr}
          onChange={(e) => setBulkNotesAr(e.target.value)}
          rows={2}
          dir="rtl"
          className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-right"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-muted-foreground">
            {t("إلغاء", "Cancel")}
          </button>
          <button
            type="button"
            disabled={working}
            onClick={onApply}
            className="rounded-lg bg-[#D4AF37] px-4 py-2 text-[#012217] disabled:opacity-50"
          >
            {working ? t("جاري التطبيق…", "Applying…") : t("تطبيق", "Apply")}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewChallengeModal({
  t,
  newSlug,
  setNewSlug,
  newTitle,
  setNewTitle,
  newTitleAr,
  setNewTitleAr,
  newDesc,
  setNewDesc,
  newDescAr,
  setNewDescAr,
  newLevel,
  setNewLevel,
  newDaysCount,
  setNewDaysCount,
  newActive,
  setNewActive,
  working,
  onSuggestSlug,
  onClose,
  onCreate,
}: {
  t: (ar: string, en: string) => string;
  newSlug: string;
  setNewSlug: (s: string) => void;
  newTitle: string;
  setNewTitle: (s: string) => void;
  newTitleAr: string;
  setNewTitleAr: (s: string) => void;
  newDesc: string;
  setNewDesc: (s: string) => void;
  newDescAr: string;
  setNewDescAr: (s: string) => void;
  newLevel: string;
  setNewLevel: (s: string) => void;
  newDaysCount: number;
  setNewDaysCount: (n: number) => void;
  newActive: boolean;
  setNewActive: (b: boolean) => void;
  working: boolean;
  onSuggestSlug: () => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-[#F5EAD4]" style={{ fontSize: 16, fontWeight: 600 }}>
          {t("تحدي جديد", "New challenge")}
        </p>
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="text-muted-foreground text-xs">slug (a-z0-9-)</label>
              <input
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
                dir="ltr"
                lang="en"
                placeholder="royal-my-challenge"
                className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-left text-[#F5EAD4]"
                style={{ fontSize: 13 }}
              />
            </div>
            <button type="button" onClick={onSuggestSlug} className="rounded-lg border border-border px-3 py-2 text-xs text-[#D4AF37]">
              {t("من العنوان", "From title")}
            </button>
          </div>
          <label className="text-muted-foreground text-xs">{t("العنوان EN", "Title EN")}</label>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            dir="ltr"
            lang="en"
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-left text-[#F5EAD4]"
          />
          <label className="text-muted-foreground text-xs">{t("العنوان AR", "Title AR")}</label>
          <input
            value={newTitleAr}
            onChange={(e) => setNewTitleAr(e.target.value)}
            dir="rtl"
            lang="ar"
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-right text-[#F5EAD4]"
          />
          <label className="text-muted-foreground text-xs">{t("الوصف EN", "Description EN")}</label>
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={2}
            dir="ltr"
            lang="en"
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-left"
          />
          <label className="text-muted-foreground text-xs">{t("الوصف AR", "Description AR")}</label>
          <textarea
            value={newDescAr}
            onChange={(e) => setNewDescAr(e.target.value)}
            rows={2}
            dir="rtl"
            lang="ar"
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-right"
          />
          <label className="text-muted-foreground text-xs">{t("المستوى", "Level")}</label>
          <select
            value={newLevel}
            onChange={(e) => setNewLevel(e.target.value)}
            dir="ltr"
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-left text-[#F5EAD4]"
          >
            <option value="beginner">beginner</option>
            <option value="intermediate">intermediate</option>
            <option value="advanced">advanced</option>
          </select>
          <label className="text-muted-foreground text-xs">{t("عدد الأيام", "Days count")}</label>
          <input
            type="number"
            min={1}
            max={365}
            value={newDaysCount}
            onChange={(e) => setNewDaysCount(Number(e.target.value) || 30)}
            dir="ltr"
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-left"
          />
          <label className="flex items-center gap-2 text-muted-foreground text-xs">
            <input type="checkbox" checked={newActive} onChange={(e) => setNewActive(e.target.checked)} />
            {t("نشط", "Active")}
          </label>
        </div>
        <p className="mt-2 text-muted-foreground" style={{ fontSize: 11 }}>
          {t("بعد الإنشاء يمكنك رفع الغلاف من بطاقة القالب.", "After create, upload the cover from the template card.")}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-muted-foreground">
            {t("إلغاء", "Cancel")}
          </button>
          <button
            type="button"
            disabled={working}
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-[#012217] disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
            {working ? t("جاري الإنشاء…", "Creating…") : t("إنشاء", "Create")}
          </button>
        </div>
      </div>
    </div>
  );
}
