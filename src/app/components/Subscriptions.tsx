import { useEffect, useMemo, useState } from "react";
import { useLang } from "./LanguageContext";
import { db, ensureAdminAuth, hasFirebaseConfig } from "../firebase";

type Subscription = {
  id: string | number;
  userName: string;
  userEmail: string;
  plan: string;
  status: string;
  amount: number;
  renewDate: string;
  note?: string;
};

const fallbackSubscriptions: Subscription[] = [
  { id: 1, userName: "Ahmed Hassan", userEmail: "ahmed@royalfit.com", plan: "Pro", status: "active", amount: 49, renewDate: "2026-05-01" },
  { id: 2, userName: "Sara Al-Rashid", userEmail: "sara@gmail.com", plan: "Basic", status: "trial", amount: 19, renewDate: "2026-04-20" },
  { id: 3, userName: "Omar Khalil", userEmail: "omar.k@outlook.com", plan: "Pro", status: "active", amount: 49, renewDate: "2026-05-12" },
];

export function Subscriptions() {
  const { lang, t } = useLang();
  const localizedFallback = useMemo<Subscription[]>(() => fallbackSubscriptions, []);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(localizedFallback);
  const [live, setLive] = useState(false);
  const [pendingId, setPendingId] = useState<string | number | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [debugPendingCount, setDebugPendingCount] = useState<number | null>(null);
  const [debugPendingJoinCount, setDebugPendingJoinCount] = useState<number | null>(null);

  useEffect(() => {
    if (!db || !hasFirebaseConfig) {
      setSubscriptions(localizedFallback);
      setLive(false);
      setAuthError("Missing Supabase config in environment.");
      return;
    }
    setAuthError(null);
    setDebugPendingCount(null);
    setDebugPendingJoinCount(null);
    let channel: ReturnType<typeof db.channel> | null = null;
    let cancelled = false;

    const loadRequests = async () => {
      try {
        const resp = await db
          .from("subscription_requests")
          .select("id, requested_plan, status, created_at, note, user_id, profiles(name, email)")
          .order("created_at", { ascending: false });
        // Important: supabase-js does not always throw on permission errors.
        if (resp.error) {
          console.error("[Subscriptions] loadRequests error", resp.error);
          setAuthError(resp.error.message);
          setSubscriptions([]);
          setLive(false);
          return;
        }
        console.debug("[Subscriptions] loadRequests rows length:", (resp.data ?? []).length);
        const rows = (resp.data ?? []) as any[];
        const mapped: Subscription[] = rows.map((data) => ({
          id: data.id,
          userName: data.profiles?.name?.toString() ?? t("مستخدم", "User"),
          userEmail: data.profiles?.email?.toString() ?? "unknown@email.com",
          plan: data.requested_plan?.toString() ?? "Pro",
          status: data.status?.toString() ?? "pending",
          amount: (data.requested_plan?.toString().toLowerCase().includes("basic") ? 19 : 49),
          renewDate: data.created_at?.toString() ?? new Date().toISOString(),
          note: data.note?.toString(),
        }));
        setSubscriptions(mapped.length ? mapped : []);
        setLive(mapped.length > 0);
      } catch (e) {
        console.error("[Subscriptions] loadRequests catch", e);
        setAuthError((e as Error)?.message ?? "Failed to load subscription requests.");
        setSubscriptions([]);
        setLive(false);
      }
    };

    ensureAdminAuth().then(async (authed) => {
      if (!authed || cancelled) {
        if (!authed) {
          setAuthError("Admin auth failed. Check VITE_ADMIN_EMAIL / VITE_ADMIN_PASSWORD and ensure VITE_LOCAL_AUTH=false in Vercel env.");
          setSubscriptions([]);
          setLive(false);
        }
        return;
      }

      // Extra debug: confirm pending count inside the same session,
      // and also test the join query shape we use on the page.
      try {
        const session = await db.auth.getSession();
        console.debug("[Subscriptions] session user:", session.data.session?.user?.id, session.data.session?.user?.email);

        const isAdminResp = await db.rpc("is_admin");
        if (isAdminResp?.error) {
          setAuthError(isAdminResp.error.message);
        } else {
          const isAdmin = typeof isAdminResp.data === "boolean"
            ? isAdminResp.data
            : (Array.isArray(isAdminResp.data) ? Boolean(isAdminResp.data[0]) : Boolean(isAdminResp.data));
          if (!isAdmin) {
            setAuthError("is_admin() returned false in this session (JWT/RLS context missing).");
          }
        }

        const pendingCountResp = await db
          .from("subscription_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");
        if (pendingCountResp.error) {
          console.error("[Subscriptions] pendingCountResp error", pendingCountResp.error);
          setAuthError(pendingCountResp.error.message);
        } else {
          console.debug("[Subscriptions] pending count (no join):", pendingCountResp.count);
          setDebugPendingCount(pendingCountResp.count ?? 0);
        }

        const pendingJoinResp = await db
          .from("subscription_requests")
          .select("id, requested_plan, status, created_at, note, user_id, profiles(name, email)")
          .eq("status", "pending")
          .order("created_at", { ascending: false });
        if (pendingJoinResp.error) {
          console.error("[Subscriptions] pendingJoinResp error", pendingJoinResp.error);
          setAuthError(pendingJoinResp.error.message);
        } else {
          console.debug("[Subscriptions] pending join rows length:", (pendingJoinResp.data ?? []).length);
          setDebugPendingJoinCount((pendingJoinResp.data ?? []).length);
        }
      } catch (e) {
        console.error("[Subscriptions] debug preflight failed", e);
      }

      if (cancelled) return;
      loadRequests();
      channel = db
        .channel("subscription-requests-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "subscription_requests" },
          () => loadRequests(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) db.removeChannel(channel);
    };
  }, [localizedFallback, t]);

  const totalRevenue = useMemo(
    () => subscriptions.filter((s) => s.status === "active").reduce((sum, s) => sum + s.amount, 0),
    [subscriptions],
  );

  const formatPlan = (plan: string) => {
    const normalized = plan.toLowerCase();
    if (normalized.includes("pro") || normalized.includes("premium") || normalized.includes("بريميوم")) {
      return t("بريميوم", "Pro");
    }
    if (normalized.includes("basic") || normalized.includes("أساسي")) {
      return t("أساسي", "Basic");
    }
    if (normalized.includes("trial") || normalized.includes("تجريبي")) {
      return t("تجريبي", "Trial");
    }
    return plan;
  };

  const formatStatus = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === "active" || normalized === "approved") return t("نشط", "Active");
    if (normalized === "cancelled") return t("ملغي", "Cancelled");
    if (normalized === "pending") return t("قيد المراجعة", "Pending");
    if (normalized === "rejected") return t("مرفوض", "Rejected");
    if (normalized === "trial") return t("تجريبي", "Trial");
    return status;
  };

  const toggleStatus = async (item: Subscription) => {
    const next = item.status === "approved" ? "rejected" : "approved";
    if (!live || !db || !hasFirebaseConfig || typeof item.id !== "string") {
      setSubscriptions((prev) => prev.map((s) => (s.id === item.id ? { ...s, status: next } : s)));
      return;
    }
    try {
      setPendingId(item.id);
      await ensureAdminAuth();
      await db.from("subscription_requests").update({ status: next }).eq("id", item.id);
      if (next === "approved") {
        await db.from("profiles").update({ plan: item.plan.toLowerCase(), status: "active" }).eq("email", item.userEmail);
      }
      await db.from("admin_notifications").insert({
        type: "subscription_request_update",
        title: next === "approved" ? t("تمت الموافقة على الاشتراك", "Subscription approved") : t("تم رفض الاشتراك", "Subscription rejected"),
        body:
          `${item.userName} (${item.userEmail}) - ` +
          (next === "approved"
            ? t("تمت الموافقة على طلب التفعيل", "Activation request approved")
            : t("تم رفض طلب التفعيل", "Activation request rejected")),
        read: false,
      });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-[#F5EAD4]">{t("الاشتراكات", "Subscriptions")}</h1>
        <p className="text-muted-foreground" style={{ fontSize: 14 }}>
          {t("إدارة خطط الاشتراك وتجديداتها", "Manage plans, renewals, and billing status")} ·{" "}
          <span className={live ? "text-emerald-400" : "text-amber-400"}>
            {live ? t("بيانات حية", "Live data") : t("بيانات تجريبية", "Demo data")}
          </span>
        </p>
        {authError ? (
          <div className="mt-3 text-red-400" style={{ fontSize: 13 }}>
            {authError}
          </div>
        ) : null}
        {debugPendingCount !== null ? (
          <div className="mt-2 text-muted-foreground" style={{ fontSize: 12 }}>
            Pending count (no join) in this session: {debugPendingCount}
          </div>
        ) : null}
        {debugPendingJoinCount !== null ? (
          <div className="mt-1 text-muted-foreground" style={{ fontSize: 12 }}>
            Pending rows with join(profiles) length: {debugPendingJoinCount}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("إجمالي الاشتراكات", "Total subscriptions")}</p>
          <p className="text-[#F5EAD4]" style={{ fontSize: 24, fontWeight: 600 }}>{subscriptions.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("الاشتراكات النشطة", "Active subscriptions")}</p>
          <p className="text-emerald-400" style={{ fontSize: 24, fontWeight: 600 }}>{subscriptions.filter((s) => s.status === "approved" || s.status === "active").length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("إيراد شهري تقديري", "Estimated monthly revenue")}</p>
          <p className="text-[#D4AF37]" style={{ fontSize: 24, fontWeight: 600 }}>${totalRevenue}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {[t("المستخدم", "User"), t("الخطة", "Plan"), t("الحالة", "Status"), t("المبلغ", "Amount"), t("التجديد", "Renew"), t("إجراء", "Action")].map((h) => (
                <th key={h} className="px-4 py-3 text-start text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((s) => (
              <tr key={s.id} className="border-b border-border/50">
                <td className="px-4 py-3">
                  <p className="text-[#F5EAD4]" style={{ fontSize: 13, fontWeight: 500 }}>{s.userName}</p>
                  <p className="text-muted-foreground" style={{ fontSize: 12 }}>{s.userEmail}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatPlan(s.plan)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full ${s.status === "approved" || s.status === "active" ? "bg-emerald-500/10 text-emerald-400" : s.status === "pending" ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`} style={{ fontSize: 11 }}>
                    {formatStatus(s.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">${s.amount}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(s.renewDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleStatus(s)}
                    disabled={pendingId === s.id}
                    className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-[#D4AF37] hover:border-[#D4AF37]/30 disabled:opacity-50"
                    style={{ fontSize: 12 }}
                  >
                    {s.status === "approved" ? t("رفض", "Reject") : t("تفعيل", "Approve")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
