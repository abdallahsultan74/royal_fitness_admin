import { useEffect, useMemo, useState } from "react";
import { Search, MoreHorizontal, Shield, ShieldOff, Mail } from "lucide-react";
import { useLang } from "./LanguageContext";
import { db, ensureAdminAuth, hasFirebaseConfig } from "../firebase";

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

export function UserManagement() {
  const { lang, t } = useLang();
  const [users, setUsers] = useState(usersFallback[lang]);
  const [search, setSearch] = useState("");
  const [live, setLive] = useState(false);
  const [pendingId, setPendingId] = useState<string | number | null>(null);

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
      const resp = await db.from("profiles").select("*").order("created_at", { ascending: false });
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
        const createdAtRaw = data.created_at?.toString();
        const createdAt = createdAtRaw ? new Date(createdAtRaw) : undefined;
        const lastActive = createdAt
          ? new Intl.RelativeTimeFormat(lang === "ar" ? "ar" : "en", {
              numeric: "auto",
            }).format(
              -Math.max(1, Math.round((Date.now() - createdAt.getTime()) / (1000 * 60))),
              "minute",
            )
          : lang === "ar"
            ? "الآن"
            : "Just now";

        return {
          id: data.id,
          name,
          email,
          plan,
            role,
          lastActive,
          status,
          initials: initials || (lang === "ar" ? "مس" : "US"),
        };
      });
      setUsers(mapped);
      setLive(true);
    };

    ensureAdminAuth().then((authed) => {
      if (!authed || cancelled) {
        setUsers(usersFallback[lang]);
        setLive(false);
        return;
      }
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

  const planPro = t("بريميوم", "Pro");
  const planTrial = t("تجريبي", "Trial");
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

  const filtered = useMemo(() => users.filter(
    (u) => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  ), [search, users]);

  const planStyles: Record<string, string> = {
    [planPro]: "bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20",
    [planTrial]: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  };

  const stats = [
    { label: t("إجمالي المستخدمين", "Total Users"), value: users.length, color: "text-[#F5EAD4]" },
    { label: t("أعضاء بريميوم", "Pro Members"), value: users.filter((u) => u.plan === planPro).length, color: "text-[#D4AF37]" },
    { label: t("فترة تجريبية", "On Trial"), value: users.filter((u) => u.plan === planTrial).length, color: "text-emerald-400" },
    { label: t("غير متصلين", "Offline"), value: users.filter((u) => !isActiveStatus(u.status)).length, color: "text-slate-300" },
  ];

  const headers = lang === "ar"
    ? ["الصورة", "الاسم", "البريد الإلكتروني", "الخطة", "الدور", "آخر نشاط", "الحالة", "الإجراءات"]
    : ["Profile", "Name", "Email", "Plan", "Role", "Last Active", "Status", "Actions"];

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
      await ensureAdminAuth();
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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-[#F5EAD4]">{t("إدارة المستخدمين", "User Management")}</h1>
        <p className="text-muted-foreground" style={{ fontSize: 14 }}>
          {t(`إدارة جميع المستخدمين المسجلين (${users.length} مستخدم)`, `Manage all registered users (${users.length} total)`)} ·{" "}
          <span className={live ? "text-emerald-400" : "text-amber-400"}>
            {live ? t("متصل بـ Firebase", "Connected to Firebase") : t("وضع تجريبي محلي", "Local demo mode")}
          </span>
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-muted-foreground" style={{ fontSize: 12 }}>{s.label}</p>
            <p className={s.color} style={{ fontSize: 24, fontWeight: 600 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={t("ابحث بالاسم أو البريد الإلكتروني...", "Search by name or email...")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full ps-10 pe-4 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
          style={{ fontSize: 13 }}
        />
      </div>

      {/* Table */}
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
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-border/50 hover:bg-[#D4AF37]/[0.03] transition-colors group">
                <td className="px-4 py-3">
                  <div className="w-9 h-9 rounded-full border-2 border-[#D4AF37]/30 bg-secondary flex items-center justify-center text-[#D4AF37]" style={{ fontSize: 11, fontWeight: 600 }}>
                    {u.initials}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#F5EAD4]" style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</td>
                <td className="px-4 py-3 text-muted-foreground" dir="ltr" style={{ fontSize: 13, textAlign: "start" }}>{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full ${planStyles[u.plan] || "bg-secondary text-muted-foreground border border-border"}`} style={{ fontSize: 11 }}>
                    {u.plan}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-[#D4AF37]/10 text-[#D4AF37]" : "bg-secondary text-muted-foreground border border-border"}`}
                    style={{ fontSize: 11 }}
                  >
                    {u.role === "admin" ? t("مدير", "Admin") : t("مستخدم", "User")}
                  </span>
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
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleSendEmail(u.email)}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-[#D4AF37] transition-colors cursor-pointer"
                      title={t("بريد", "Email")}
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleStatus(u.id, u.status)}
                      disabled={pendingId === u.id}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={isActiveStatus(u.status) ? t("حظر", "Block") : t("إلغاء الحظر", "Unblock")}
                    >
                      {isActiveStatus(u.status) ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </button>
                    <button className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-[#F5EAD4] transition-colors cursor-pointer">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground" style={{ fontSize: 14 }}>
            {t("لا يوجد مستخدمون مطابقون للبحث.", "No users match your search.")}
          </div>
        )}
      </div>
    </div>
  );
}
