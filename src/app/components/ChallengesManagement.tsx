import { useCallback, useEffect, useState } from "react";
import { Save, Trophy } from "lucide-react";
import { useLang } from "./LanguageContext";
import { db, ensureStaffAuth, hasFirebaseConfig } from "../firebase";

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

  const save = async () => {
    if (!selected || !db || !hasFirebaseConfig) return;
    setSaving(true);
    setAuthError(null);
    try {
      await ensureStaffAuth();
      const { error } = await db
        .from("challenge_templates")
        .update({
          title: title.trim(),
          title_ar: titleAr.trim() || null,
          description: desc.trim() || null,
          description_ar: descAr.trim() || null,
          level,
          days_count: daysCount,
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
        days_count: daysCount,
        cover_image_url: coverUrl.trim() || null,
        is_active: isActive,
      };
      setRows((prev) => prev.map((r) => (r.id === selected.id ? next : r)));
      setSelected(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl text-[#F5EAD4] sm:text-2xl">
          <Trophy className="h-6 w-6 text-[#D4AF37]" />
          {t("التحديات (نيتف)", "Native challenges")}
        </h1>
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
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <p className="text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 600 }}>
                  {t("بيانات القالب", "Template")}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-muted-foreground text-xs">{t("المعرّف (slug)", "Slug (read-only)")}</label>
                  <input
                    readOnly
                    value={selected.slug}
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-muted-foreground sm:col-span-2"
                    style={{ fontSize: 13 }}
                  />
                  <label className="text-muted-foreground text-xs">{t("العنوان (EN)", "Title (EN)")}</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-[#F5EAD4] sm:col-span-2"
                    style={{ fontSize: 13 }}
                  />
                  <label className="text-muted-foreground text-xs">{t("العنوان (عربي)", "Title (AR)")}</label>
                  <input
                    value={titleAr}
                    onChange={(e) => setTitleAr(e.target.value)}
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-[#F5EAD4] sm:col-span-2"
                    style={{ fontSize: 13 }}
                  />
                  <label className="text-muted-foreground text-xs">{t("الوصف (EN)", "Description (EN)")}</label>
                  <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    rows={3}
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-[#F5EAD4] sm:col-span-2"
                    style={{ fontSize: 13 }}
                  />
                  <label className="text-muted-foreground text-xs">{t("الوصف (عربي)", "Description (AR)")}</label>
                  <textarea
                    value={descAr}
                    onChange={(e) => setDescAr(e.target.value)}
                    rows={3}
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-[#F5EAD4] sm:col-span-2"
                    style={{ fontSize: 13 }}
                  />
                  <label className="text-muted-foreground text-xs">{t("المستوى", "Level")}</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-[#F5EAD4] sm:col-span-2"
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
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-[#F5EAD4] sm:col-span-2"
                    style={{ fontSize: 13 }}
                  />
                  <label className="text-muted-foreground text-xs">{t("رابط صورة الغلاف", "Cover image URL")}</label>
                  <input
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="https://..."
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-[#F5EAD4] sm:col-span-2"
                    style={{ fontSize: 13 }}
                  />
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
                <p className="mb-2 text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 600 }}>
                  {t("خطة الأيام (قراءة)", "Day plan (read-only)")}
                </p>
                <p className="mb-3 text-muted-foreground" style={{ fontSize: 12 }}>
                  {t(
                    "تفاصيل كل يوم مولّدة في الـ migration؛ لتغيير أهداف يوم معيّن أضف لاحقًا محرر أيام.",
                    "Per-day targets are seeded via migration; a day editor can be added later.",
                  )}
                </p>
                {daysLoading ? (
                  <p className="text-muted-foreground text-sm">{t("جاري تحميل الأيام…", "Loading days…")}</p>
                ) : (
                  <div className="max-h-[360px] overflow-auto rounded-lg border border-border">
                    <table className="w-full min-w-[640px] text-start text-sm">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">EN</th>
                          <th className="px-2 py-2">AR</th>
                          <th className="px-2 py-2">min</th>
                          <th className="px-2 py-2">ex</th>
                          <th className="px-2 py-2">kcal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {days.map((d) => (
                          <tr key={d.id} className="border-b border-border/40">
                            <td className="px-2 py-1.5 text-[#F5EAD4]">{d.day_number}</td>
                            <td className="max-w-[200px] truncate px-2 py-1.5 text-muted-foreground">{d.title}</td>
                            <td className="max-w-[200px] truncate px-2 py-1.5 text-muted-foreground">{d.title_ar ?? "—"}</td>
                            <td className="px-2 py-1.5">{d.target_minutes}</td>
                            <td className="px-2 py-1.5">{d.target_exercises}</td>
                            <td className="px-2 py-1.5">{d.target_calories}</td>
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
    </div>
  );
}
