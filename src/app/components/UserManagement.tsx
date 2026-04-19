import { useEffect, useMemo, useState } from "react";
import { Search, MoreHorizontal, Shield, ShieldOff, Mail, Eye, UserPlus } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { useLang } from "./LanguageContext";
import { db, ensureStaffAuth, getIsAdmin, hasFirebaseConfig } from "../firebase";
import { normalizePlanKey, textMatchesQuery } from "../searchUtils";

const usersFallback = {
  ar: [
    { id: 1, name: "أحمد حسن", email: "ahmed@royalfit.com", plan: "بريميوم", role: "admin", lastActive: "منذ ٢ دقيقة", status: "نشط", initials: "أح" },
    { id: 2, name: "سارة الراشد", email: "sara@gmail.com", plan: "تجريبي", role: "user", lastActive: "منذ ١٥ دقيقة", status: "نشط", initials: "سر" },
    { id: 3, name: "عمر خليل", email: "omar.k@outlook.com", plan: "بريميوم", role: "user", lastActive: "منذ ساعة", status: "نشط", initials: "عخ" },
    { id: 4, name: "فاطمة نور", email: "fatima.n@yahoo.com", plan: "أساسي", role: "user", lastActive: "منذ ٣ ساعات", status: "نشط", initials: "فن" },
    { id: 5, name: "يوسف كريم", email: "youssef@mail.com", plan: "بريميوم", role: "user", lastActive: "منذ ٥ ساعات", status: "نشط", initials: "يك" },
    { id: 6, name: "ليلى محمود", email: "layla.m@icloud.com", plan: "تجريبي", role: "user", lastActive: "منذ يوم", status: "محظور", initials: "لم" },
    { id: 7, name: "حسن علي", email: "h.ali@gmail.com", plan: "أساسي", role: "user", lastActive: "منذ يومين", status: "نشط", initials: "حع" },
    { id: 8, name: "نادية سعيد", email: "nadia.s@mail.com", plan: "بريميوم", role: "user", lastActive: "منذ ٣ أيام", status: "نشط", initials: "نس" },
    { id: 9, name: "خالد منصور", email: "khalid@outlook.com", plan: "تجريبي", role: "user", lastActive: "منذ أسبوع", status: "محظور", initials: "خم" },
    { id: 10, name: "رانيا فارس", email: "rania.f@gmail.com", plan: "بريميوم", role: "user", lastActive: "الآن", status: "نشط", initials: "رف" },
  ],
  en: [
    { id: 1, name: "Ahmed Hassan", email: "ahmed@royalfit.com", plan: "Pro", role: "admin", lastActive: "2 min ago", status: "Active", initials: "AH" },
    { id: 2, name: "Sara Al-Rashid", email: "sara@gmail.com", plan: "Trial", role: "user", lastActive: "15 min ago", status: "Active", initials: "SA" },
    { id: 3, name: "Omar Khalil", email: "omar.k@outlook.com", plan: "Pro", role: "user", lastActive: "1 hr ago", status: "Active", initials: "OK" },
    { id: 4, name: "Fatima Noor", email: "fatima.n@yahoo.com", plan: "Basic", role: "user", lastActive: "3 hrs ago", status: "Active", initials: "FN" },
    { id: 5, name: "Youssef Karim", email: "youssef@mail.com", plan: "Pro", role: "user", lastActive: "5 hrs ago", status: "Active", initials: "YK" },
    { id: 6, name: "Layla Mahmoud", email: "layla.m@icloud.com", plan: "Trial", role: "user", lastActive: "1 day ago", status: "Blocked", initials: "LM" },
    { id: 7, name: "Hassan Ali", email: "h.ali@gmail.com", plan: "Basic", role: "user", lastActive: "2 days ago", status: "Active", initials: "HA" },
    { id: 8, name: "Nadia Saeed", email: "nadia.s@mail.com", plan: "Pro", role: "user", lastActive: "3 days ago", status: "Active", initials: "NS" },
    { id: 9, name: "Khalid Mansour", email: "khalid@outlook.com", plan: "Trial", role: "user", lastActive: "1 week ago", status: "Blocked", initials: "KM" },
    { id: 10, name: "Rania Faris", email: "rania.f@gmail.com", plan: "Pro", role: "user", lastActive: "Just now", status: "Active", initials: "RF" },
  ],
};

type RoleTab = "all" | "user" | "coach" | "admin";

export function UserManagement() {
  const { lang, t } = useLang();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState(usersFallback[lang]);
  const [search, setSearch] = useState("");
  const [roleTab, setRoleTab] = useState<RoleTab>("all");
  const [live, setLive] = useState(false);
  const [pendingId, setPendingId] = useState<string | number | null>(null);
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffRole, setStaffRole] = useState<"coach" | "admin">("coach");
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffCreating, setStaffCreating] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  // Activity details are now shown on a dedicated user details page.

  useEffect(() => {
    if (!db || !hasFirebaseConfig) {
      setUsers(usersFallback[lang]);
      setLive(false);
      return;
    }
    let channel: ReturnType<typeof db.channel> | null = null;
    let cancelled = false;

    const loadUsers = async () => {
      if (!db) return;
      const resp = await db.rpc("api_admin_user_progress_summary");
      const rows = resp.data ?? [];
      const mapped = rows.map((data, idx) => {
        const fallbackName = lang === "ar" ? "مستخدم" : "User";
        const status = data.status?.toString() ?? (lang === "ar" ? "نشط" : "Active");
        const role = data.role?.toString() ?? "user";
        const plan = data.plan?.toString() ?? (lang === "ar" ? "تجريبي" : "Trial");
        const name = data.name?.toString() ?? `${fallbackName} ${idx + 1}`;
        const email = data.email?.toString() ?? "unknown@email.com";
        const initials = name
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase();
        const lastLogRaw = data.last_weight_log_at?.toString();
        const lastAt = lastLogRaw ? new Date(lastLogRaw) : null;
        const lastActive =
          lastAt && !Number.isNaN(lastAt.getTime())
            ? new Intl.RelativeTimeFormat(lang === "ar" ? "ar" : "en", {
                numeric: "auto",
              }).format(
                -Math.max(1, Math.round((Date.now() - lastAt.getTime()) / (1000 * 60))),
                "minute",
              )
            : lang === "ar"
              ? "الآن"
              : "Just now";

        return {
          id: data.user_id,
          name,
          email,
          plan,
          role,
          weight: data.current_weight_kg,
          bmi: data.bmi,
          targetWeight: data.target_weight_kg,
          challenge: data.active_challenge_title,
          challengeDay: data.challenge_current_day,
          lastActive,
          status,
          initials: initials || (lang === "ar" ? "مس" : "US"),
        };
      });
      setUsers(mapped);
      setLive(true);
    };

    ensureStaffAuth().then(async (authed) => {
      if (!authed || cancelled) {
        setUsers(usersFallback[lang]);
        setLive(false);
        setIsAdminUser(false);
        return;
      }
      setIsAdminUser(await getIsAdmin());
      loadUsers();
      channel = db
        .channel("profiles-live-users")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles" },
          () => loadUsers(),
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) db.removeChannel(channel);
    };
  }, [lang]);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    setSearch((prev) => (q !== prev ? q : prev));
  }, [searchParams]);

  const statusActive = t("نشط", "Active");
  const statusOffline = t("غير متصل", "Offline");
  const normalizeStatus = (status: string) => status.trim().toLowerCase();
  const isActiveStatus = (status: string) => {
    const normalized = normalizeStatus(status);
    return normalized === "active" || normalized === "نشط";
  };
  const formatStatusLabel = (status: string) => {
    if (isActiveStatus(status)) return statusActive;
    return statusOffline;
  };

  const roleLabel = (roleRaw: string) => {
    const r = (roleRaw ?? "user").toString().trim().toLowerCase();
    if (r === "admin") return t("أدمن", "Admin");
    if (r === "coach") return t("مدرب", "Coach");
    return t("مستخدم", "User");
  };

  const formatPlanCell = (planRaw: string) => {
    const k = normalizePlanKey(planRaw);
    if (k === "pro") return t("بريميوم", "Pro");
    if (k === "trial") return t("تجريبي", "Trial");
    if (k === "basic") return t("أساسي", "Basic");
    return planRaw || "—";
  };

  const planBadgeClass = (planRaw: string) => {
    const k = normalizePlanKey(planRaw);
    if (k === "pro") return "bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20";
    if (k === "trial") return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    if (k === "basic") return "bg-sky-500/10 text-sky-300 border border-sky-500/20";
    return "bg-secondary text-muted-foreground border border-border";
  };

  const filtered = useMemo(() => {
    const q = search;
    return users.filter((u) => {
      const r = (u.role ?? "user").toString().trim().toLowerCase();
      if (roleTab !== "all") {
        if (roleTab === "user" && r !== "user") return false;
        if (roleTab === "coach" && r !== "coach") return false;
        if (roleTab === "admin" && r !== "admin") return false;
      }
      if (!q.trim()) return true;
      const hay = [
        u.name,
        u.email,
        u.role,
        roleLabel(u.role),
        u.plan,
        formatPlanCell(String(u.plan)),
        u.challenge ? String(u.challenge) : "",
        String(u.weight ?? ""),
        String(u.bmi ?? ""),
      ].join(" ");
      return textMatchesQuery(hay, q);
    });
  }, [users, search, roleTab, t]);

  const stats = [
    { label: t("إجمالي السجلات", "Total rows"), value: users.length, color: "text-[#F5EAD4]" },
    { label: t("مستخدمون", "Members"), value: users.filter((u) => (u.role ?? "user").toString().toLowerCase() === "user").length, color: "text-muted-foreground" },
    { label: t("مدربون", "Coaches"), value: users.filter((u) => (u.role ?? "").toString().toLowerCase() === "coach").length, color: "text-emerald-400" },
    { label: t("أدمن", "Admins"), value: users.filter((u) => (u.role ?? "").toString().toLowerCase() === "admin").length, color: "text-[#D4AF37]" },
    { label: t("بريميوم", "Pro plans"), value: users.filter((u) => normalizePlanKey(u.plan) === "pro").length, color: "text-[#D4AF37]" },
    { label: t("تجريبي", "Trial plans"), value: users.filter((u) => normalizePlanKey(u.plan) === "trial").length, color: "text-emerald-400" },
    { label: t("غير متصلين", "Offline"), value: users.filter((u) => !isActiveStatus(u.status)).length, color: "text-slate-300" },
  ];

  const headers = lang === "ar"
    ? ["الصورة", "الاسم", "الدور", "البريد الإلكتروني", "الخطة", "الوزن", "BMI", "التحدي", "آخر نشاط", "الحالة", "الإجراءات"]
    : ["Profile", "Name", "Role", "Email", "Plan", "Weight", "BMI", "Challenge", "Last Active", "Status", "Actions"];

  const roleStyle = (roleRaw: string) => {
    const r = (roleRaw ?? "user").toString().trim().toLowerCase();
    if (r === "admin") return "bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/25";
    if (r === "coach") return "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20";
    return "bg-secondary text-muted-foreground border border-border";
  };

  const handleSendEmail = (email: string) => {
    if (typeof window === "undefined") return;
    window.location.href = `mailto:${email}`;
  };

  const handleToggleStatus = async (userId: string | number, currentStatus: string) => {
    const nextStatus = isActiveStatus(currentStatus) ? statusOffline : statusActive;

    if (!live || !db || !hasFirebaseConfig || typeof userId !== "string") {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: nextStatus } : u)),
      );
      return;
    }

    try {
      setPendingId(userId);
      await ensureStaffAuth();
      await db.from("profiles").update({ status: nextStatus }).eq("id", userId);
    } catch {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: nextStatus } : u)),
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="min-w-0">
        <h1 className="text-xl text-[#F5EAD4] sm:text-2xl">{t("إدارة المستخدمين", "User Management")}</h1>
        <p className="text-muted-foreground text-sm sm:text-[14px]">
          {t(`إدارة جميع المستخدمين المسجلين (${users.length} مستخدم)`, `Manage all registered users (${users.length} total)`)} ·{" "}
          <span className={live ? "text-emerald-400" : "text-amber-400"}>
            {live ? t("متصل بـ Supabase", "Connected to Supabase") : t("وضع تجريبي محلي", "Local demo mode")}
          </span>
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-7">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
            <p className="text-muted-foreground text-xs sm:text-[12px]">{s.label}</p>
            <p className={`${s.color} text-xl font-semibold sm:text-2xl`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Role categories */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", t("الكل", "All")] as const,
            ["user", t("مستخدمون", "Users")] as const,
            ["coach", t("مدربون", "Coaches")] as const,
            ["admin", t("أدمن", "Admins")] as const,
          ] satisfies readonly [RoleTab, string][]
        ).map(([key, lab]) => (
          <button
            key={key}
            type="button"
            onClick={() => setRoleTab(key)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              roleTab === key ? "border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#F5EAD4]" : "border-border text-muted-foreground hover:border-[#D4AF37]/30"
            }`}
          >
            {lab}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-full sm:max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("ابحث بالاسم أو البريد أو الخطة أو التحدي (عربي/إنجليزي)...", "Search name, email, plan, challenge (AR/EN)...")}
            value={search}
            onChange={(e) => {
              const v = e.target.value;
              setSearch(v);
              const next = new URLSearchParams(searchParams);
              if (v.trim()) next.set("q", v);
              else next.delete("q");
              setSearchParams(next, { replace: true });
            }}
            className="w-full ps-10 pe-4 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
            style={{ fontSize: 13 }}
          />
        </div>
        {isAdminUser ? (
        <button
          onClick={() => {
            setStaffError(null);
            setStaffRole("coach");
            setStaffName("");
            setStaffEmail("");
            setStaffPassword("");
            setStaffOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-2 text-[#F5EAD4] hover:bg-[#D4AF37]/15"
          style={{ fontSize: 13, fontWeight: 600 }}
          title={t("إضافة مدرب/أدمن", "Add coach/admin")}
        >
          <UserPlus className="h-4 w-4 text-[#D4AF37]" />
          {t("إضافة مدرب", "Add coach")}
        </button>
        ) : null}
      </div>

      {/* Create staff modal */}
      {staffOpen && isAdminUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[#F5EAD4]" style={{ fontSize: 16, fontWeight: 700 }}>
                  {t("إضافة حساب مدرب/أدمن", "Create coach/admin account")}
                </h3>
                <p className="text-muted-foreground mt-1" style={{ fontSize: 12 }}>
                  {t("هيتعمل باسورد مؤقت، والمدرب يقدر يغيّره بعدين.", "A temporary password will be set; they can change it later.")}
                </p>
              </div>
              <button
                onClick={() => setStaffOpen(false)}
                className="rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-muted-foreground hover:text-[#F5EAD4]"
                style={{ fontSize: 12 }}
              >
                {t("إغلاق", "Close")}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setStaffRole("coach")}
                  className={`rounded-lg border px-3 py-2 ${staffRole === "coach" ? "border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#F5EAD4]" : "border-border bg-secondary text-muted-foreground"}`}
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  {t("مدرب", "Coach")}
                </button>
                <button
                  onClick={() => setStaffRole("admin")}
                  className={`rounded-lg border px-3 py-2 ${staffRole === "admin" ? "border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#F5EAD4]" : "border-border bg-secondary text-muted-foreground"}`}
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  {t("أدمن", "Admin")}
                </button>
              </div>

              <div>
                <label className="text-muted-foreground" style={{ fontSize: 12 }}>
                  {t("الاسم", "Name")}
                </label>
                <input
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-secondary border border-border px-3 py-2 text-[#F5EAD4] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
                  style={{ fontSize: 13 }}
                  placeholder={t("اسم المدرب", "Coach name")}
                />
              </div>
              <div>
                <label className="text-muted-foreground" style={{ fontSize: 12 }}>
                  {t("الإيميل", "Email")}
                </label>
                <input
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-secondary border border-border px-3 py-2 text-[#F5EAD4] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
                  style={{ fontSize: 13 }}
                  placeholder="coach@email.com"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-muted-foreground" style={{ fontSize: 12 }}>
                  {t("باسورد مؤقت", "Temporary password")}
                </label>
                <input
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-secondary border border-border px-3 py-2 text-[#F5EAD4] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
                  style={{ fontSize: 13 }}
                  placeholder={t("على الأقل 8 حروف/أرقام", "At least 8 characters")}
                  type="password"
                  dir="ltr"
                />
              </div>

              {staffError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-red-200" style={{ fontSize: 12 }}>
                  {staffError}
                </div>
              )}

              <button
                disabled={staffCreating || !live || !db || !hasFirebaseConfig}
                onClick={async () => {
                  if (!db || !hasFirebaseConfig) return;
                  setStaffError(null);
                  setStaffCreating(true);
                  try {
                    const authed = await getIsAdmin();
                    if (!authed) throw new Error(t("لا يوجد صلاحية أدمن.", "Not authorized as admin."));
                    const sessionResp = await db.auth.getSession();
                    const token = sessionResp.data.session?.access_token;
                    if (!token) throw new Error(t("جلسة الدخول غير صالحة.", "Invalid session."));

                    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
                    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
                    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Missing Supabase env");

                    const resp = await fetch(`${supabaseUrl}/functions/v1/create-staff-user`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                        apikey: supabaseAnonKey,
                      },
                      body: JSON.stringify({
                        email: staffEmail,
                        password: staffPassword,
                        name: staffName,
                        role: staffRole,
                      }),
                    });

                    const text = await resp.text();
                    if (!resp.ok) {
                      let reason = text;
                      try {
                        const j = JSON.parse(text) as { error?: string; details?: unknown };
                        reason = j?.error ? j.error : text;
                        if (j?.details) reason = `${reason} (${JSON.stringify(j.details)})`;
                      } catch {
                        /* ignore */
                      }
                      throw new Error(`${t("فشل إنشاء الحساب", "Create failed")}: ${resp.status} ${reason}`);
                    }
                    setStaffOpen(false);
                  } catch (e: any) {
                    const msg = e?.message ? String(e.message) : String(e);
                    setStaffError(msg);
                  } finally {
                    setStaffCreating(false);
                  }
                }}
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37] px-3 py-2 text-[#0B1B14] hover:brightness-110 disabled:opacity-60"
                style={{ fontSize: 13, fontWeight: 800 }}
              >
                {staffCreating ? t("جاري الإنشاء...", "Creating...") : t("إنشاء الحساب", "Create account")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
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
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-border/50 hover:bg-[#D4AF37]/[0.03] transition-colors group">
                <td className="px-4 py-3">
                  <div className="w-9 h-9 rounded-full border-2 border-[#D4AF37]/30 bg-secondary flex items-center justify-center text-[#D4AF37]" style={{ fontSize: 11, fontWeight: 600 }}>
                    {u.initials}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#F5EAD4]" style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full ${roleStyle(u.role)}`} style={{ fontSize: 11, fontWeight: 600 }}>
                    {roleLabel(u.role)}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground" dir="ltr" style={{ fontSize: 13, textAlign: "start" }}>{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full ${planBadgeClass(String(u.plan))}`} style={{ fontSize: 11 }}>
                    {formatPlanCell(String(u.plan))}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                    {u.weight ? `${Number(u.weight).toFixed(1)} kg` : "--"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                    {u.bmi ? Number(u.bmi).toFixed(1) : "--"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-[#F5EAD4]" style={{ fontSize: 12 }}>
                      {u.challenge ?? t("لا يوجد", "None")}
                    </span>
                    <span className="text-muted-foreground" style={{ fontSize: 11 }}>
                      {u.challengeDay ? t(`اليوم ${u.challengeDay}`, `Day ${u.challengeDay}`) : ""}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>{u.lastActive}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isActiveStatus(u.status) ? "bg-cyan-400" : "bg-slate-400"}`} />
                    <span className={isActiveStatus(u.status) ? "text-cyan-400" : "text-slate-400"} style={{ fontSize: 12 }}>
                      {formatStatusLabel(u.status)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    {live && typeof u.id === "string" ? (
                      <button
                        type="button"
                        onClick={() => navigate(`/users/${u.id}`)}
                        className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-[#D4AF37]"
                        title={t("عرض النشاط", "View activity")}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleSendEmail(u.email)}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-[#D4AF37] transition-colors cursor-pointer"
                      title={t("بريد", "Email")}
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(u.id, u.status)}
                      disabled={pendingId === u.id}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={isActiveStatus(u.status) ? t("حظر", "Block") : t("إلغاء الحظر", "Unblock")}
                    >
                      {isActiveStatus(u.status) ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </button>
                    <button type="button" className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-[#F5EAD4]">
                      <MoreHorizontal className="h-4 w-4" />
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
            {t("لا يوجد مستخدمون مطابقون للبحث.", "No users match your search.")}
          </div>
        )}
      </div>
    </div>
  );
}
