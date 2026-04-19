import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Mail, Phone, Scale, Activity, Dumbbell, Save, Send } from "lucide-react";
import { useLang } from "./LanguageContext";
import { db, ensureStaffAuth, hasFirebaseConfig } from "../firebase";

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  plan: string | null;
  plan_expires_at?: string | null;
  feature_flags?: Record<string, unknown> | null;
  status: string | null;
  role: string | null;
  whatsapp_phone: string | null;
  height_cm?: number | null;
  current_weight_kg?: number | null;
  target_weight_kg?: number | null;
  bmi?: number | null;
  bmi_status?: string | null;
  created_at?: string | null;
};

type WeightRow = { logged_at: string; weight_kg: number; source?: string };
type DailyRow = {
  date_key: string;
  total_minutes: number;
  total_calories: number;
  completed_exercises: number;
  session_count: number;
};
type SessionRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_sec: number;
  calories: number;
  exercise_count: number;
  completed: boolean;
};

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function formatCreatedAtLabel(raw: string | null | undefined, locale: string) {
  if (!raw) return "—";
  const dt = new Date(raw);
  const diffMs = Date.now() - dt.getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  // "First day" emphasis: show days + hours (not minutes)
  if (days <= 1) {
    const h = Math.max(0, hours);
    const d = Math.max(0, days);
    if (locale === "ar") return `${d} يوم · ${h} ساعة`;
    return `${d}d · ${h}h`;
  }
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return fmt.format(-days, "day");
}

function normalizeWhatsappToE164Digits(raw: string) {
  const cleaned = raw.trim().replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  let digits = cleaned.replace(/^\+/, "");

  // Heuristic for local Egyptian mobile numbers like 01xxxxxxxxx -> 201xxxxxxxxx
  if (digits.startsWith("0") && digits.length === 11 && digits.startsWith("01")) {
    digits = `20${digits.slice(1)}`;
  }

  // If user typed 0020... -> 20...
  if (digits.startsWith("00")) digits = digits.slice(2);

  // wa.me requires digits only (no +)
  return digits.replace(/\D/g, "");
}

export function UserDetailsPage() {
  const { t, isRTL, lang } = useLang();
  const nav = useNavigate();
  const params = useParams();
  const userId = params.id ?? "";

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [tab, setTab] = useState<"overview" | "weight" | "daily" | "workouts">("overview");
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<string>("user");
  const [whatsDraft, setWhatsDraft] = useState<string>("");
  const [msgType, setMsgType] = useState<"notification" | "message">("notification");
  const [msgTitle, setMsgTitle] = useState<string>("");
  const [msgBody, setMsgBody] = useState<string>("");
  const [planDraft, setPlanDraft] = useState<string>("basic");
  const [planExpiresInput, setPlanExpiresInput] = useState<string>("");
  const [adminPlansEnabled, setAdminPlansEnabled] = useState<boolean>(true);
  const [challengesEnabled, setChallengesEnabled] = useState<boolean>(true);

  const load = useCallback(async () => {
    if (!db || !hasFirebaseConfig || !userId) return;
    setLoading(true);
    setAuthError(null);
    try {
      await ensureStaffAuth();
      const [pRes, wRes, dRes, sRes] = await Promise.all([
        db.from("profiles").select("*").eq("id", userId).maybeSingle(),
        db.from("weight_logs").select("*").eq("user_id", userId).order("logged_at", { ascending: false }).limit(180),
        db.from("daily_stats").select("*").eq("user_id", userId).order("date_key", { ascending: false }).limit(180),
        db
          .from("workout_sessions")
          .select("*")
          .eq("user_id", userId)
          .eq("completed", true)
          .order("started_at", { ascending: false })
          .limit(80),
      ]);
      if (pRes.error) setAuthError(pRes.error.message);
      const prof = (pRes.data ?? null) as any;
      setProfile(prof);
      setRoleDraft(String(prof?.role ?? "user"));
      setWhatsDraft(String(prof?.whatsapp_phone ?? ""));
      setPlanDraft(String(prof?.plan ?? "basic"));
      const pe = prof?.plan_expires_at as string | null | undefined;
      if (pe) {
        const d = new Date(pe);
        if (!Number.isNaN(d.getTime())) {
          const pad = (n: number) => String(n).padStart(2, "0");
          setPlanExpiresInput(
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
          );
        } else setPlanExpiresInput("");
      } else setPlanExpiresInput("");
      const ff = (prof?.feature_flags ?? {}) as Record<string, unknown>;
      setAdminPlansEnabled(ff.admin_plans !== false);
      setChallengesEnabled(ff.challenges !== false);
      setWeights((wRes.data ?? []) as any);
      setDaily((dRes.data ?? []) as any);
      setSessions((sRes.data ?? []) as any);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const createdLabel = useMemo(
    () => formatCreatedAtLabel(profile?.created_at, lang === "ar" ? "ar" : "en"),
    [profile?.created_at, lang],
  );

  const bmiLabel = useMemo(() => {
    const v = profile?.bmi;
    if (!v || !Number.isFinite(Number(v))) return "—";
    return Number(v).toFixed(1);
  }, [profile?.bmi]);

  const weightLabel = useMemo(() => {
    const v = profile?.current_weight_kg;
    if (!v || !Number.isFinite(Number(v))) return "—";
    return `${Number(v).toFixed(1)} kg`;
  }, [profile?.current_weight_kg]);

  const tabBtn = (key: typeof tab, icon: any, ar: string, en: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
        tab === key ? "bg-[#D4AF37]/15 text-[#D4AF37]" : "text-muted-foreground hover:bg-secondary/60"
      }`}
    >
      {icon}
      {t(ar, en)}
    </button>
  );

  const handleEmail = () => {
    if (!profile?.email || typeof window === "undefined") return;
    window.location.href = `mailto:${profile.email}`;
  };

  const handleWhatsApp = () => {
    const raw = (profile?.whatsapp_phone ?? whatsDraft)?.toString().trim();
    if (!raw || typeof window === "undefined") return;
    const digits = normalizeWhatsappToE164Digits(raw);
    if (!digits) return;
    window.open(`https://wa.me/${digits}`, "_blank", "noopener,noreferrer");
  };

  const saveProfileBasics = async () => {
    if (!db || !hasFirebaseConfig || !userId) return;
    setSaving(true);
    try {
      await ensureStaffAuth();
      const nextRole = ["user", "coach", "admin"].includes(roleDraft) ? roleDraft : "user";
      const nextWhats = whatsDraft.trim() || null;
      const feature_flags = {
        admin_plans: adminPlansEnabled,
        challenges: challengesEnabled,
      };
      const planExpiresIso = planExpiresInput.trim()
        ? new Date(planExpiresInput).toISOString()
        : null;
      const resp = await db
        .from("profiles")
        .update({
          role: nextRole,
          whatsapp_phone: nextWhats,
          plan: planDraft.trim() || "basic",
          plan_expires_at: planExpiresIso,
          feature_flags,
        })
        .eq("id", userId);
      if (resp.error) {
        setAuthError(resp.error.message);
        return;
      }
      setProfile((p) =>
        p
          ? {
              ...p,
              role: nextRole,
              whatsapp_phone: nextWhats,
              plan: planDraft.trim() || "basic",
              plan_expires_at: planExpiresIso,
              feature_flags,
            }
          : p,
      );
    } finally {
      setSaving(false);
    }
  };

  const sendUserMessage = async () => {
    if (!db || !hasFirebaseConfig || !userId) return;
    const body = msgBody.trim();
    if (!body) return;
    setSaving(true);
    setAuthError(null);
    try {
      await ensureStaffAuth();
      const resp = await db.from("user_notifications").insert({
        user_id: userId,
        type: msgType,
        title: msgTitle.trim() || null,
        body,
      });
      if (resp.error) {
        setAuthError(resp.error.message);
        return;
      }
      setMsgTitle("");
      setMsgBody("");
    } finally {
      setSaving(false);
    }
  };

  const headerName = profile?.name || t("مستخدم", "User");

  return (
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => nav(-1)}
            className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-secondary/60 hover:text-[#F5EAD4]"
            title={t("رجوع", "Back")}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-xl text-[#F5EAD4] sm:text-2xl">{headerName}</h1>
            <p className="truncate text-muted-foreground" style={{ fontSize: 13 }}>
              {profile?.email || "—"} · {t("تاريخ التسجيل:", "Registered:")} {createdLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleEmail}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-[#F5EAD4] hover:bg-secondary/60"
          >
            <Mail className="h-4 w-4 text-[#D4AF37]" />
            {t("بريد", "Email")}
          </button>
          <button
            type="button"
            onClick={handleWhatsApp}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-[#F5EAD4] hover:bg-secondary/60"
            disabled={!profile?.whatsapp_phone}
            title={profile?.whatsapp_phone ? profile.whatsapp_phone : ""}
          >
            <Phone className="h-4 w-4 text-[#D4AF37]" />
            {t("واتساب", "WhatsApp")}
          </button>
        </div>
      </div>

      {authError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200" style={{ fontSize: 13 }}>
          {authError}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-muted-foreground text-xs">{t("الوزن الحالي", "Current weight")}</p>
          <p className="text-[#F5EAD4] text-xl font-semibold sm:text-2xl">{weightLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-muted-foreground text-xs">{t("BMI", "BMI")}</p>
          <p className="text-[#D4AF37] text-xl font-semibold sm:text-2xl">{bmiLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-muted-foreground text-xs">{t("الطول", "Height")}</p>
          <p className="text-[#F5EAD4] text-xl font-semibold sm:text-2xl">
            {profile?.height_cm ? `${Number(profile.height_cm).toFixed(0)} cm` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-muted-foreground text-xs">{t("الهدف", "Target")}</p>
          <p className="text-[#F5EAD4] text-xl font-semibold sm:text-2xl">
            {profile?.target_weight_kg ? `${Number(profile.target_weight_kg).toFixed(1)} kg` : "—"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-2">
        {tabBtn("overview", null, "نظرة عامة", "Overview")}
        {tabBtn("weight", <Scale className="h-4 w-4" />, "سجل الوزن", "Weight")}
        {tabBtn("daily", <Activity className="h-4 w-4" />, "يومي", "Daily")}
        {tabBtn("workouts", <Dumbbell className="h-4 w-4" />, "التمارين", "Workouts")}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {loading ? (
          <p className="text-muted-foreground" style={{ fontSize: 13 }}>
            {t("جاري التحميل…", "Loading…")}
          </p>
        ) : null}

        {tab === "overview" && !loading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("البيانات", "Details")}
              </p>
              <div className="mt-2 space-y-1 text-[#F5EAD4]" style={{ fontSize: 13 }}>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("الخطة", "Plan")}</span>
                  <span>{profile?.plan ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("الحالة", "Status")}</span>
                  <span>{profile?.status ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("الدور", "Role")}</span>
                  <select
                    value={roleDraft}
                    onChange={(e) => setRoleDraft(e.target.value)}
                    className="rounded-md border border-border bg-card px-2 py-1 text-[#F5EAD4]"
                    style={{ fontSize: 12 }}
                  >
                    <option value="user">{t("مستخدم", "User")}</option>
                    <option value="coach">{t("مدرب", "Coach")}</option>
                    <option value="admin">{t("أدمن", "Admin")}</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span className="text-muted-foreground shrink-0">{t("خطة الاشتراك", "Subscription plan")}</span>
                  <select
                    value={planDraft}
                    onChange={(e) => setPlanDraft(e.target.value)}
                    className="max-w-full rounded-md border border-border bg-card px-2 py-1 text-[#F5EAD4]"
                    style={{ fontSize: 12 }}
                  >
                    <option value="trial">trial</option>
                    <option value="basic">basic</option>
                    <option value="pro">pro</option>
                    <option value="premium">premium</option>
                    <option value="royal">royal</option>
                    <option value="elite">elite</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                    {t("انتهاء الاشتراك (اختياري)", "Plan expiry (optional)")}
                  </span>
                  <input
                    type="datetime-local"
                    value={planExpiresInput}
                    onChange={(e) => setPlanExpiresInput(e.target.value)}
                    className="rounded-md border border-border bg-card px-2 py-1 text-[#F5EAD4]"
                    style={{ fontSize: 12 }}
                  />
                </div>
                <div className="space-y-2 rounded-md border border-border/40 bg-background/30 p-2">
                  <p className="text-muted-foreground" style={{ fontSize: 11 }}>
                    {t("ظهور المحتوى للمستخدم", "Content visibility for this user")}
                  </p>
                  <label className="flex cursor-pointer items-center gap-2" style={{ fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={adminPlansEnabled}
                      onChange={(e) => setAdminPlansEnabled(e.target.checked)}
                    />
                    <span className="text-[#F5EAD4]">{t("خطط الأدمن (json_plan)", "Admin training plans")}</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2" style={{ fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={challengesEnabled}
                      onChange={(e) => setChallengesEnabled(e.target.checked)}
                    />
                    <span className="text-[#F5EAD4]">{t("التحديات النشطة", "Active challenges")}</span>
                  </label>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("واتساب", "WhatsApp")}</span>
                  <input
                    value={whatsDraft}
                    onChange={(e) => setWhatsDraft(e.target.value)}
                    className="w-[220px] max-w-[60vw] rounded-md border border-border bg-card px-2 py-1 text-[#F5EAD4]"
                    style={{ fontSize: 12 }}
                    dir="ltr"
                    placeholder={t("رقم واتساب", "WhatsApp number")}
                  />
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={saveProfileBasics}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-[#F5EAD4] hover:bg-secondary/60 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4 text-[#D4AF37]" />
                    {saving ? t("جارٍ الحفظ…", "Saving…") : t("حفظ", "Save")}
                  </button>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("إرسال رسالة/إشعار", "Send message/notification")}
              </p>
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMsgType("notification")}
                    className={`rounded-lg px-3 py-1.5 text-xs ${
                      msgType === "notification" ? "bg-[#D4AF37]/15 text-[#D4AF37]" : "text-muted-foreground hover:bg-secondary/60"
                    }`}
                  >
                    {t("إشعار", "Notification")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMsgType("message")}
                    className={`rounded-lg px-3 py-1.5 text-xs ${
                      msgType === "message" ? "bg-[#D4AF37]/15 text-[#D4AF37]" : "text-muted-foreground hover:bg-secondary/60"
                    }`}
                  >
                    {t("رسالة", "Message")}
                  </button>
                </div>
                <input
                  value={msgTitle}
                  onChange={(e) => setMsgTitle(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[#F5EAD4]"
                  style={{ fontSize: 12 }}
                  placeholder={t("عنوان (اختياري)", "Title (optional)")}
                />
                <textarea
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[#F5EAD4]"
                  style={{ fontSize: 12 }}
                  rows={4}
                  placeholder={t("اكتب الرسالة هنا…", "Write message…")}
                />
                <button
                  type="button"
                  onClick={sendUserMessage}
                  disabled={saving || !msgBody.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-3 py-2 text-sm font-medium text-[#0B2F24] disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {saving ? t("جارٍ الإرسال…", "Sending…") : t("إرسال", "Send")}
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("ملخص النشاط", "Activity summary")}
              </p>
              <div className="mt-3 space-y-2">
                <div className="h-2 rounded-full bg-secondary/60">
                  <div
                    className="h-2 rounded-full bg-[#D4AF37]"
                    style={{ width: `${Math.round(clamp01(weights.length / 30) * 100)}%` }}
                  />
                </div>
                <p className="text-muted-foreground" style={{ fontSize: 12 }}>
                  {t("قياسات وزن آخر 30 إدخال تقريبًا.", "Weight logs density (approx last 30 entries).")}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "weight" && !loading ? (
          <div className="space-y-2">
            {weights.length === 0 ? (
              <p className="text-muted-foreground" style={{ fontSize: 13 }}>
                {t("لا توجد قياسات وزن.", "No weight entries.")}
              </p>
            ) : (
              weights.map((row) => (
                <div
                  key={row.logged_at}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/40 px-3 py-2"
                >
                  <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                    {row.logged_at}
                  </span>
                  <span className="font-medium text-[#F5EAD4]" style={{ fontSize: 13 }}>
                    {Number(row.weight_kg).toFixed(1)} kg
                  </span>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "daily" && !loading ? (
          <div className="space-y-2">
            {daily.length === 0 ? (
              <p className="text-muted-foreground" style={{ fontSize: 13 }}>
                {t("لا توجد إحصائيات يومية.", "No daily stats.")}
              </p>
            ) : (
              daily.map((row) => (
                <div key={row.date_key} className="rounded-lg border border-border/60 bg-secondary/40 px-3 py-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#F5EAD4]" style={{ fontSize: 13 }}>
                      {row.date_key}
                    </span>
                    <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                      {row.session_count} {t("جلسات", "sessions")} · {row.completed_exercises} {t("تمارين", "ex")}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground" style={{ fontSize: 11 }}>
                    {row.total_minutes} {t("دقيقة", "min")} · {row.total_calories} {t("سعر", "kcal")}
                  </p>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "workouts" && !loading ? (
          <div className="space-y-3">
            {sessions.length === 0 ? (
              <p className="text-muted-foreground" style={{ fontSize: 13 }}>
                {t("لا توجد جلسات مكتملة.", "No completed sessions.")}
              </p>
            ) : (
              sessions.map((sess) => {
                const start = sess.started_at ? new Date(sess.started_at).toLocaleString(isRTL ? "ar" : "en") : "—";
                return (
                  <div key={sess.id} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[#D4AF37]" style={{ fontSize: 12 }}>
                        {start}
                      </span>
                      <span className="text-muted-foreground" style={{ fontSize: 11 }}>
                        {Math.round(sess.duration_sec / 60)} {t("د", "m")} · {sess.calories} kcal · {sess.exercise_count}{" "}
                        {t("تمرين", "ex")}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

