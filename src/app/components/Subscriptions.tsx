import { useEffect, useMemo, useState } from "react";
import { useLang } from "./LanguageContext";
import { db, ensureStaffAuth, hasFirebaseConfig, isLocalAuthMode } from "../firebase";

type Subscription = {
  id: string | number;
  userId: string;
  userName: string;
  userEmail: string;
  plan: string;
  status: string;
  amount: number;
  renewDate: string;
  note?: string;
  kind: "activate" | "renew";
  durationDays: number;
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
          .select("id, requested_plan, status, created_at, note, user_id, request_kind, duration_days")
          .order("created_at", { ascending: false });
        // Important: supabase-js does not always throw on permission errors.
        if (resp.error) {
          console.error("[Subscriptions] loadRequests error", resp.error);
          setAuthError(resp.error.message);
          setSubscriptions([]);
          setLive(false);
          return;
        }
        const rows = (resp.data ?? []) as any[];
        const userIds = Array.from(
          new Set(rows.map((r) => r.user_id).filter((v) => v !== null && v !== undefined).map((v) => v.toString())),
        );

        let profilesById = new Map<string, any>();
        if (userIds.length > 0) {
          const profilesResp = await db
            .from("profiles")
            .select("id, name, email")
            .in("id", userIds);

          if (profilesResp.error) {
            console.error("[Subscriptions] profiles join (in) error", profilesResp.error);
            setAuthError(profilesResp.error.message);
          } else {
            const profiles = (profilesResp.data ?? []) as any[];
            profilesById = new Map(profiles.map((p) => [p.id?.toString(), p]));
          }
        }

        const mapped: Subscription[] = rows.map((data) => {
          const uid = data.user_id?.toString();
          const prof = uid ? profilesById.get(uid) : null;
          return {
            id: data.id,
            userId: uid ?? "",
            userName: prof?.name?.toString() ?? t("مستخدم", "User"),
            userEmail: prof?.email?.toString() ?? "unknown@email.com",
            plan: data.requested_plan?.toString() ?? "Pro",
            status: data.status?.toString() ?? "pending",
            amount: (data.requested_plan?.toString().toLowerCase().includes("basic") ? 19 : 49),
            renewDate: data.created_at?.toString() ?? new Date().toISOString(),
            note: data.note?.toString(),
            kind: (String(data.request_kind ?? "activate").toLowerCase() === "renew" ? "renew" : "activate"),
            durationDays: Number(data.duration_days ?? 30) || 30,
          };
        });

        setSubscriptions(mapped);
        setLive(true);
      } catch (e) {
        console.error("[Subscriptions] loadRequests catch", e);
        setAuthError((e as Error)?.message ?? "Failed to load subscription requests.");
        setSubscriptions([]);
        setLive(false);
      }
    };

    ensureStaffAuth().then(async (authed) => {
      if (!authed || cancelled) {
        if (!authed) {
          setAuthError(
            isLocalAuthMode
              ? "Staff auth failed in local demo mode (unexpected)."
              : "Staff auth failed: sign in on the login page as a user with profiles.role = admin or coach, OR set VITE_ADMIN_EMAIL + VITE_ADMIN_PASSWORD on Vercel to a Supabase user that has admin/coach role. Wrong password or missing role on that user also causes this.",
          );
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

        const [isAdminResp, isCoachResp] = await Promise.all([db.rpc("is_admin"), db.rpc("is_coach")]);
        if (isAdminResp?.error) {
          setAuthError(isAdminResp.error.message);
        } else if (isCoachResp?.error) {
          setAuthError(isCoachResp.error.message);
        } else {
          const rpcBool = (data: unknown) =>
            typeof data === "boolean" ? data : Array.isArray(data) ? Boolean(data[0]) : Boolean(data);
          const isStaff = rpcBool(isAdminResp.data) || rpcBool(isCoachResp.data);
          if (!isStaff) {
            setAuthError("Staff role missing: is_admin() and is_coach() are false (check JWT / profiles.role).");
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

        // Replace nested join debug with a safe two-step approach.
        const pendingRowsResp = await db
          .from("subscription_requests")
          .select("id, user_id")
          .eq("status", "pending")
          .order("created_at", { ascending: false });
        if (pendingRowsResp.error) {
          console.error("[Subscriptions] pendingRowsResp error", pendingRowsResp.error);
          setAuthError(pendingRowsResp.error.message);
        } else {
          const pendingRows = (pendingRowsResp.data ?? []) as any[];
          const ids = Array.from(new Set(pendingRows.map((r) => r.user_id).filter(Boolean).map((v) => v.toString())));
          if (ids.length === 0) {
            setDebugPendingJoinCount(0);
          } else {
            const profilesResp = await db.from("profiles").select("id").in("id", ids);
            if (profilesResp.error) {
              console.error("[Subscriptions] profiles debug in error", profilesResp.error);
              setAuthError(profilesResp.error.message);
              setDebugPendingJoinCount(0);
            } else {
              // We store profiles-count here to prove the profiles fetch works.
              setDebugPendingJoinCount((profilesResp.data ?? []).length);
            }
          }
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
      await ensureStaffAuth();
      const session = await db.auth.getSession();
      const senderId = session.data.session?.user?.id ?? null;

      await db.from("subscription_requests").update({ status: next }).eq("id", item.id);

      if (next === "approved") {
        const planLower = item.plan.toLowerCase();
        // Activation: set expiry from now. Renewal: extend from max(now, current expiry).
        const nowIso = new Date().toISOString();
        let base: Date | null = null;
        if (item.kind === "renew") {
          const profResp = await db.from("profiles").select("plan_expires_at").eq("id", item.userId).maybeSingle();
          const cur = profResp.data?.plan_expires_at ? new Date(profResp.data.plan_expires_at) : null;
          base = (cur && cur.getTime() > Date.now()) ? cur : new Date();
        } else {
          base = new Date();
        }
        const nextExpiry = new Date(base.getTime() + item.durationDays * 24 * 60 * 60 * 1000).toISOString();

        await db
          .from("profiles")
          .update({ plan: planLower, status: "active", plan_expires_at: nextExpiry })
          .eq("id", item.userId);

        // Notify user on approval.
        await db.from("user_notifications").insert({
          user_id: item.userId,
          sender_id: senderId,
          type: "notification",
          title: item.kind === "renew" ? "Subscription renewed" : "Subscription activated",
          body:
            item.kind === "renew"
              ? `Your subscription has been renewed for ${item.durationDays} days.`
              : `Your subscription has been activated for ${item.durationDays} days.`,
        });
      } else {
        // Notify user on rejection.
        await db.from("user_notifications").insert({
          user_id: item.userId,
          sender_id: senderId,
          type: "notification",
          title: item.kind === "renew" ? "Renewal rejected" : "Request rejected",
          body: "Your subscription request was rejected. Please contact support if needed.",
        });
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
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="min-w-0">
        <h1 className="text-xl text-[#F5EAD4] sm:text-2xl">{t("الاشتراكات", "Subscriptions")}</h1>
        <p className="text-muted-foreground text-sm sm:text-[14px]">
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

      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
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
    </div>
  );
}
