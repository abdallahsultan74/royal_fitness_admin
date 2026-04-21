import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useLang } from "./LanguageContext";
import { db, ensureStaffAuth, hasFirebaseConfig, isLocalAuthMode } from "../firebase";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

type Subscription = {
  id: string | number;
  userId: string;
  userName: string;
  userEmail: string;
  plan: string;
  packageKey?: string;
  packageName?: string;
  variantId?: string;
  status: string;
  amount: number;
  currency?: string;
  renewDate: string;
  note?: string;
  kind: "activate" | "renew" | "cancel";
  durationDays: number;
  approvedAt?: string;
  preferredCoachId?: string;
  preferredCoachName?: string;
};

type PackageRow = {
  packageId: string;
  packageKey: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  packageActive: boolean;
  variants: Array<{
    variantId: string;
    durationDays: number;
    priceCents: number;
    currency: string;
    active: boolean;
  }>;
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
  const [showLegacyPricing, setShowLegacyPricing] = useState(false);
  const [pendingId, setPendingId] = useState<string | number | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [debugPendingCount, setDebugPendingCount] = useState<number | null>(null);
  const [debugPendingJoinCount, setDebugPendingJoinCount] = useState<number | null>(null);
  const loadRequestsRef = useRef<(() => Promise<void>) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [pricesByKey, setPricesByKey] = useState<Record<string, { priceCents: number; currency: string }>>({});
  const [metricsRevenue, setMetricsRevenue] = useState<{ value: number; currency: string } | null>(null);
  const [pricePlanKey, setPricePlanKey] = useState("pro");
  const [priceDurationDays, setPriceDurationDays] = useState(30);
  const [priceCurrency, setPriceCurrency] = useState("EGP");
  const [priceAmount, setPriceAmount] = useState<number>(0);
  const [priceSaving, setPriceSaving] = useState(false);

  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [packagesError, setPackagesError] = useState<string | null>(null);
  const didInitPackageSelectionsRef = useRef(false);
  const [pkgKey, setPkgKey] = useState("pro");
  const [pkgNameEn, setPkgNameEn] = useState("Pro");
  const [pkgNameAr, setPkgNameAr] = useState("برو");
  const [pkgDescEn, setPkgDescEn] = useState("");
  const [pkgDescAr, setPkgDescAr] = useState("");
  const [pkgActive, setPkgActive] = useState(true);
  const [pkgSaving, setPkgSaving] = useState(false);
  const [deletePkgId, setDeletePkgId] = useState<string | null>(null);
  const [deletePkgBusy, setDeletePkgBusy] = useState(false);

  const [variantPkgId, setVariantPkgId] = useState<string>("");
  const [variantDurationDays, setVariantDurationDays] = useState(30);
  const [variantCurrency, setVariantCurrency] = useState("EGP");
  const [variantAmount, setVariantAmount] = useState<number>(0);
  const [variantActive, setVariantActive] = useState(true);
  const [variantSaving, setVariantSaving] = useState(false);

  const [entPkgId, setEntPkgId] = useState<string>("");
  const [entFlags, setEntFlags] = useState<{ admin_plans: boolean; challenges: boolean }>({
    admin_plans: true,
    challenges: true,
  });
  const [entShowAdvanced, setEntShowAdvanced] = useState(false);
  const [entJson, setEntJson] = useState<string>('{"admin_plans": true, "challenges": true}');
  const [entSaving, setEntSaving] = useState(false);

  const [trainingPlans, setTrainingPlans] = useState<Array<{ id: string; title: string }>>([]);
  const [bindPkgId, setBindPkgId] = useState<string>("");
  const [boundPlanIds, setBoundPlanIds] = useState<Set<string>>(new Set());
  const [bindingsSaving, setBindingsSaving] = useState(false);

  const activePackages = useMemo(() => packages.filter((p) => p.packageActive), [packages]);

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
        const variantPriceById = new Map<string, { priceCents: number; currency: string }>();
        // Load packages for mapping + management UI.
        setPackagesError(null);
        const packagesResp = await db.rpc("api_list_subscription_packages");
        if (packagesResp.error) {
          console.error("[Subscriptions] api_list_subscription_packages error", packagesResp.error);
          setPackagesError(packagesResp.error.message);
          setPackages([]);
        } else {
          const rows = (packagesResp.data ?? []) as any[];
          const byId = new Map<string, PackageRow>();
          rows.forEach((r) => {
            const packageId = String(r.package_id ?? "");
            const packageKey = String(r.package_key ?? "");
            if (!packageId) return;
            const cur = byId.get(packageId) ?? {
              packageId,
              packageKey,
              name: String(r.name ?? packageKey ?? ""),
              nameAr: r.name_ar ? String(r.name_ar) : undefined,
              description: r.description ? String(r.description) : undefined,
              descriptionAr: r.description_ar ? String(r.description_ar) : undefined,
              packageActive: Boolean(r.package_active),
              variants: [],
            };
            const variantId = String(r.variant_id ?? "");
            if (variantId) {
              const priceCents = Number(r.price_cents ?? 0) || 0;
              const currency = String(r.currency ?? "EGP") || "EGP";
              cur.variants.push({
                variantId,
                durationDays: Number(r.duration_days ?? 30) || 30,
                priceCents,
                currency,
                active: Boolean(r.variant_active),
              });
              variantPriceById.set(variantId, { priceCents, currency });
            }
            byId.set(packageId, cur);
          });
          const list = Array.from(byId.values()).sort((a, b) => a.packageKey.localeCompare(b.packageKey));
          list.forEach((p) => {
            p.variants.sort((a, b) => a.durationDays - b.durationDays);
          });
          setPackages(list);
          if (list.length === 0) {
            setPackagesError(
              "No subscription packages found. Create a package + variant, or ensure the seed migration is applied on this Supabase project.",
            );
          }
          const active = list.filter((p) => p.packageActive);
          const firstActiveId = active[0]?.packageId ?? "";
          const activeIds = new Set(active.map((p) => p.packageId));
          if (!didInitPackageSelectionsRef.current) {
            if (!variantPkgId && firstActiveId) setVariantPkgId(firstActiveId);
            if (!entPkgId && firstActiveId) setEntPkgId(firstActiveId);
            if (!bindPkgId && firstActiveId) setBindPkgId(firstActiveId);
            didInitPackageSelectionsRef.current = true;
          } else {
            // Keep user selection stable; only reset if it no longer exists/active.
            if (variantPkgId && !activeIds.has(variantPkgId)) setVariantPkgId(firstActiveId);
            if (entPkgId && !activeIds.has(entPkgId)) setEntPkgId(firstActiveId);
            if (bindPkgId && !activeIds.has(bindPkgId)) setBindPkgId(firstActiveId);
          }
        }

        // Load training plans list + current bindings (staff-only).
        const plansResp = await db.from("training_plans").select("id, title").order("title", { ascending: true });
        if (plansResp.error) {
          console.error("[Subscriptions] training_plans error", plansResp.error);
        } else {
          const list = ((plansResp.data ?? []) as any[]).map((p) => ({
            id: String(p.id),
            title: String(p.title ?? "Plan"),
          }));
          setTrainingPlans(list);
        }

        let localPricesByKey: Record<string, { priceCents: number; currency: string }> = {};
        const pricesResp = await db.rpc("api_list_subscription_prices");
        if (pricesResp.error) {
          console.error("[Subscriptions] api_list_subscription_prices error", pricesResp.error);
        } else {
          const m: Record<string, { priceCents: number; currency: string }> = {};
          const rows = (pricesResp.data ?? []) as any[];
          rows.forEach((r) => {
            const planKey = String(r.plan_key ?? "").toLowerCase();
            const dur = Number(r.duration_days ?? 30) || 30;
            const active = Boolean(r.active);
            if (!planKey || !active) return;
            const key = `${planKey}:${dur}`;
            m[key] = {
              priceCents: Number(r.price_cents ?? 0) || 0,
              currency: String(r.currency ?? "EGP") || "EGP",
            };
          });
          setPricesByKey(m);
          localPricesByKey = m;
          const defaultKey = `${pricePlanKey.toLowerCase()}:${priceDurationDays}`;
          const def = m[defaultKey];
          if (def && (priceAmount === 0 || Number.isNaN(priceAmount))) {
            setPriceAmount(def.priceCents / 100);
            setPriceCurrency(def.currency);
          }
        }

        const metricsResp = await db.rpc("api_admin_dashboard_metrics", { p_days: 30 });
        if (!metricsResp.error) {
          const row = Array.isArray(metricsResp.data) ? metricsResp.data[0] : metricsResp.data;
          const revCents = Number(row?.revenue_cents ?? 0) || 0;
          setMetricsRevenue({ value: revCents / 100, currency: String(row?.currency ?? "EGP") || "EGP" });
        }

        const resp = await db
          .from("subscription_requests")
          .select("id, requested_plan, status, created_at, note, user_id, request_kind, duration_days, price_cents, currency, approved_at, preferred_coach_id, package_id, variant_id")
          .order("created_at", { ascending: false });
        // Important: supabase-js does not always throw on permission errors.
        if (resp.error) {
          console.error("[Subscriptions] loadRequests error", resp.error);
          // Common case: DB migrations not applied yet (request_kind/duration_days missing).
          if (String(resp.error.message || "").toLowerCase().includes("request_kind")) {
            setAuthError(
              "Database migrations are missing: run the latest subscription_requests migration (adds request_kind, duration_days, plan_expires_at) on Supabase, then redeploy.",
            );
          } else {
            setAuthError(resp.error.message);
          }
          setSubscriptions([]);
          setLive(false);
          return;
        }
        const rows = (resp.data ?? []) as any[];
        const userIds = Array.from(
          new Set(rows.map((r) => r.user_id).filter((v) => v !== null && v !== undefined).map((v) => v.toString())),
        );
        const coachIds = Array.from(
          new Set(rows.map((r) => r.preferred_coach_id).filter((v) => v !== null && v !== undefined).map((v) => v.toString())),
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

        let coachesById = new Map<string, any>();
        if (coachIds.length > 0) {
          const coachesResp = await db
            .from("profiles")
            .select("id, name")
            .in("id", coachIds);
          if (!coachesResp.error) {
            const coaches = (coachesResp.data ?? []) as any[];
            coachesById = new Map(coaches.map((p) => [p.id?.toString(), p]));
          }
        }

        const mapped: Subscription[] = rows.map((data) => {
          const uid = data.user_id?.toString();
          const prof = uid ? profilesById.get(uid) : null;
          const planKey = (data.requested_plan?.toString() ?? "pro").toLowerCase();
          const dur = Number(data.duration_days ?? 30) || 30;
          const priceKey = `${planKey}:${dur}`;
          const planPrice = localPricesByKey[priceKey];
          const vId = data.variant_id?.toString();
          const variantPrice = vId ? variantPriceById.get(String(vId)) : undefined;
          const cents = Number(data.price_cents ?? (variantPrice?.priceCents ?? planPrice?.priceCents ?? 0)) || 0;
          const cur = String(data.currency ?? (variantPrice?.currency ?? planPrice?.currency ?? "EGP")) || "EGP";

          const pkgId = data.package_id?.toString();
          let pkgName: string | undefined;
          let pkgKey2: string | undefined;
          if (pkgId) {
            const p = packages.find((x) => x.packageId === pkgId);
            pkgKey2 = p?.packageKey;
            pkgName = (lang === "ar" ? (p?.nameAr || p?.name) : p?.name) || p?.packageKey;
          }
          return {
            id: data.id,
            userId: uid ?? "",
            userName: prof?.name?.toString() ?? t("مستخدم", "User"),
            userEmail: prof?.email?.toString() ?? "unknown@email.com",
            plan: pkgName ?? (data.requested_plan?.toString() ?? "Pro"),
            packageKey: pkgKey2,
            packageName: pkgName,
            variantId: vId ? String(vId) : undefined,
            status: data.status?.toString() ?? "pending",
            amount: cents > 0 ? cents / 100 : (planKey.includes("basic") ? 19 : 49),
            currency: cur,
            renewDate: data.created_at?.toString() ?? new Date().toISOString(),
            note: data.note?.toString(),
            kind: (() => {
              const k = String(data.request_kind ?? "activate").toLowerCase();
              if (k === "renew") return "renew";
              if (k === "cancel") return "cancel";
              return "activate";
            })(),
            durationDays: dur,
            approvedAt: data.approved_at?.toString(),
            preferredCoachId: data.preferred_coach_id?.toString(),
            preferredCoachName: data.preferred_coach_id ? (coachesById.get(String(data.preferred_coach_id))?.name?.toString() ?? undefined) : undefined,
          };
        });

        if (!cancelled) {
          setSubscriptions(mapped);
          setLive(true);
        }
      } catch (e) {
        console.error("[Subscriptions] loadRequests catch", e);
        setAuthError((e as Error)?.message ?? "Failed to load subscription requests.");
        setSubscriptions([]);
        setLive(false);
      }
    };

    loadRequestsRef.current = loadRequests;

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
      loadRequestsRef.current = null;
      if (channel) db.removeChannel(channel);
    };
  }, [localizedFallback, t]);

  // Load plan bindings for the selected package (avoid stale state inside loadRequests).
  useEffect(() => {
    if (!db || !hasFirebaseConfig) return;
    if (!bindPkgId) {
      setBoundPlanIds(new Set());
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        await ensureStaffAuth();
        const bindsResp = await db
          .from("subscription_package_plans")
          .select("plan_id")
          .eq("package_id", bindPkgId);
        if (cancelled) return;
        if (bindsResp.error) {
          console.error("[Subscriptions] subscription_package_plans error", bindsResp.error);
          return;
        }
        const ids = new Set<string>(((bindsResp.data ?? []) as any[]).map((r) => String(r.plan_id)));
        setBoundPlanIds(ids);
      } catch (e) {
        console.error("[Subscriptions] load bindings failed", e);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [bindPkgId]);

  // Load entitlements for the selected package (avoid stale state inside loadRequests).
  useEffect(() => {
    if (!db || !hasFirebaseConfig) return;
    if (!entPkgId) return;
    let cancelled = false;
    const run = async () => {
      try {
        await ensureStaffAuth();
        const entResp = await db
          .from("subscription_package_entitlements")
          .select("entitlements")
          .eq("package_id", entPkgId)
          .maybeSingle();
        if (cancelled) return;
        if (entResp.error) {
          console.error("[Subscriptions] subscription_package_entitlements error", entResp.error);
          return;
        }
        const raw = (entResp.data as any)?.entitlements;
        const obj = raw && typeof raw === "object" ? raw : {};
        const admin_plans = typeof obj?.admin_plans === "boolean" ? obj.admin_plans : true;
        const challenges = typeof obj?.challenges === "boolean" ? obj.challenges : true;
        setEntFlags({ admin_plans, challenges });
        setEntJson(JSON.stringify({ ...obj }, null, 2));
      } catch (e) {
        console.error("[Subscriptions] load entitlements failed", e);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [entPkgId]);

  const totalRevenueLabel = useMemo(() => {
    if (metricsRevenue) {
      return `${metricsRevenue.value.toLocaleString(lang === "ar" ? "ar-EG" : "en-US", {
        maximumFractionDigits: 2,
      })} ${(metricsRevenue.currency || "EGP").toUpperCase()}`;
    }
    const sum = subscriptions
      .filter((s) => s.status === "approved" || s.status === "active")
      .reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
    return `${sum.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")} EGP`;
  }, [lang, metricsRevenue, subscriptions]);

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

      // Cancel request: revoke immediately on approval.
      if (next === "approved" && item.kind === "cancel") {
        const revoke = await db.rpc("api_staff_revoke_user_package", { p_user_id: item.userId });
        if (revoke.error) throw revoke.error;
        await db.from("subscription_requests").update({ status: next }).eq("id", item.id);
      }
      // If approving a package-based request, persist the variant price on the request row.
      else if (next === "approved" && item.variantId) {
        const vResp = await db
          .from("subscription_package_variants")
          .select("price_cents, currency")
          .eq("id", item.variantId)
          .maybeSingle();
        if (vResp.error) throw vResp.error;
        const vCents = Number((vResp.data as any)?.price_cents ?? 0) || 0;
        const vCur = String((vResp.data as any)?.currency ?? "EGP") || "EGP";
        await db
          .from("subscription_requests")
          .update({ status: next, price_cents: vCents, currency: vCur })
          .eq("id", item.id);
      } else {
        await db.from("subscription_requests").update({ status: next }).eq("id", item.id);
      }

      if (next === "approved") {
        if (item.kind === "cancel") {
          await db.from("user_notifications").insert({
            user_id: item.userId,
            sender_id: senderId,
            type: "notification",
            title: "Subscription cancelled",
            body: "Your subscription has been cancelled.",
          });
          await db.from("admin_notifications").insert({
            type: "subscription_request_update",
            title: t("تم إلغاء الاشتراك", "Subscription cancelled"),
            body: `${item.userName} (${item.userEmail}) - ${t("تمت الموافقة على طلب الإلغاء", "Cancellation approved")}`,
            read: false,
          });
          return;
        }
        const planLower = (item.packageKey || item.plan).toLowerCase();
        // Activation: set expiry from now. Renewal: extend from max(now, current expiry).
        let base: Date | null = null;
        if (item.kind === "renew") {
          const profResp = await db.from("profiles").select("plan_expires_at").eq("id", item.userId).maybeSingle();
          const cur = profResp.data?.plan_expires_at ? new Date(profResp.data.plan_expires_at) : null;
          base = (cur && cur.getTime() > Date.now()) ? cur : new Date();
        } else {
          base = new Date();
        }
        const nextExpiry = new Date(base.getTime() + item.durationDays * 24 * 60 * 60 * 1000).toISOString();

        // Prefer package assignment when the request has a variant.
        if (item.variantId) {
          const rpc = await db.rpc("api_staff_assign_user_package", {
            p_user_id: item.userId,
            p_variant_id: item.variantId,
          });
          if (rpc.error) throw rpc.error;
        } else {
          await db
            .from("profiles")
            .update({ plan: planLower, status: "active", plan_expires_at: nextExpiry })
            .eq("id", item.userId);
        }

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
        // If rejecting, do not change profile subscription state.
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

  const savePackage = async () => {
    if (!db || !hasFirebaseConfig) return;
    const key = (pkgKey || "").trim().toLowerCase();
    const name = (pkgNameEn || "").trim();
    if (!key || !name) return;
    setPkgSaving(true);
    setPackagesError(null);
    try {
      await ensureStaffAuth();
      const resp = await db.rpc("api_staff_upsert_subscription_package", {
        p_key: key,
        p_name: name,
        p_name_ar: (pkgNameAr || "").trim() || null,
        p_description: (pkgDescEn || "").trim() || null,
        p_description_ar: (pkgDescAr || "").trim() || null,
        p_active: Boolean(pkgActive),
      });
      if (resp.error) throw resp.error;
      const newId = (resp.data ? String(resp.data) : "").trim();
      if (newId) {
        setVariantPkgId(newId);
        setEntPkgId(newId);
        setBindPkgId(newId);
      }
      await loadRequestsRef.current?.();
    } catch (e) {
      setPackagesError((e as Error)?.message ?? "Failed to save package.");
    } finally {
      setPkgSaving(false);
    }
  };

  const confirmDeletePackage = async () => {
    if (!db || !hasFirebaseConfig) return;
    if (!deletePkgId) return;
    setDeletePkgBusy(true);
    setPackagesError(null);
    try {
      await ensureStaffAuth();
      const resp = await db.rpc("api_staff_delete_subscription_package", { p_package_id: deletePkgId });
      if (resp.error) throw resp.error;
      setPackages((prev) => prev.map((p) => (p.packageId === deletePkgId ? { ...p, packageActive: false } : p)));
      setDeletePkgId(null);
      await loadRequestsRef.current?.();
    } catch (e) {
      setPackagesError((e as Error)?.message ?? "Failed to delete package.");
    } finally {
      setDeletePkgBusy(false);
    }
  };

  const saveVariant = async () => {
    if (!db || !hasFirebaseConfig) return;
    if (!variantPkgId) return;
    const dur = Number(variantDurationDays) || 30;
    const cents = Math.max(0, Math.round((Number(variantAmount) || 0) * 100));
    const cur = (variantCurrency || "EGP").trim().toUpperCase();
    setVariantSaving(true);
    setPackagesError(null);
    try {
      await ensureStaffAuth();
      const resp = await db.rpc("api_staff_upsert_subscription_package_variant", {
        p_package_id: variantPkgId,
        p_duration_days: dur,
        p_price_cents: cents,
        p_currency: cur,
        p_active: Boolean(variantActive),
      });
      if (resp.error) throw resp.error;
      await loadRequestsRef.current?.();
    } catch (e) {
      setPackagesError((e as Error)?.message ?? "Failed to save variant.");
    } finally {
      setVariantSaving(false);
    }
  };

  const saveEntitlements = async () => {
    if (!db || !hasFirebaseConfig) return;
    if (!entPkgId) return;
    setEntSaving(true);
    setPackagesError(null);
    try {
      await ensureStaffAuth();
      let parsed: any = {
        admin_plans: Boolean(entFlags.admin_plans),
        challenges: Boolean(entFlags.challenges),
      };
      if (entShowAdvanced) {
        try {
          const advanced = JSON.parse(entJson || "{}");
          if (advanced && typeof advanced === "object") parsed = { ...advanced, ...parsed };
        } catch {
          throw new Error("Advanced entitlements must be valid JSON.");
        }
      }
      const resp = await db.rpc("api_staff_set_subscription_package_entitlements", {
        p_package_id: entPkgId,
        p_entitlements: parsed,
      });
      if (resp.error) throw resp.error;
      await loadRequestsRef.current?.();
    } catch (e) {
      setPackagesError((e as Error)?.message ?? "Failed to save entitlements.");
    } finally {
      setEntSaving(false);
    }
  };

  const savePlanBindings = async () => {
    if (!db || !hasFirebaseConfig) return;
    if (!bindPkgId) return;
    setBindingsSaving(true);
    setPackagesError(null);
    try {
      await ensureStaffAuth();
      const del = await db.from("subscription_package_plans").delete().eq("package_id", bindPkgId);
      if (del.error) throw del.error;

      const rows = Array.from(boundPlanIds.values()).map((planId) => ({
        package_id: bindPkgId,
        plan_id: planId,
      }));
      if (rows.length > 0) {
        const ins = await db.from("subscription_package_plans").insert(rows);
        if (ins.error) throw ins.error;
      }
      await loadRequestsRef.current?.();
    } catch (e) {
      setPackagesError((e as Error)?.message ?? "Failed to save plan bindings.");
    } finally {
      setBindingsSaving(false);
    }
  };

  const savePlanPrice = async () => {
    if (!db || !hasFirebaseConfig) return;
    const planKey = (pricePlanKey || "").trim().toLowerCase();
    const durationDays = Number(priceDurationDays) || 30;
    const currency = (priceCurrency || "EGP").trim().toUpperCase();
    const cents = Math.max(0, Math.round((Number(priceAmount) || 0) * 100));
    if (!planKey) return;

    setPriceSaving(true);
    setAuthError(null);
    try {
      await ensureStaffAuth();
      // Deactivate existing active record (if any), then insert the new active price.
      await db
        .from("subscription_plan_prices")
        .update({ active: false })
        .eq("plan_key", planKey)
        .eq("duration_days", durationDays)
        .eq("active", true);

      const session = await db.auth.getSession();
      const setBy = session.data.session?.user?.id ?? null;

      const { error } = await db.from("subscription_plan_prices").insert({
        plan_key: planKey,
        duration_days: durationDays,
        price_cents: cents,
        currency,
        active: true,
        set_by: setBy,
      });
      if (error) {
        setAuthError(error.message);
        return;
      }
      // Refresh
      await loadRequestsRef.current?.();
    } catch (e) {
      setAuthError((e as Error)?.message ?? "Failed to save plan price.");
    } finally {
      setPriceSaving(false);
    }
  };

  const requestDelete = (item: Subscription) => {
    setDeleteTarget(item);
  };

  const confirmDeleteRequest = async () => {
    const item = deleteTarget;
    if (!item) return;
    if (!live || !db || !hasFirebaseConfig) {
      setSubscriptions((prev) => prev.filter((s) => s.id !== item.id));
      setDeleteTarget(null);
      return;
    }
    const id = String(item.id);
    setDeleteBusy(true);
    setPendingId(item.id);
    setAuthError(null);
    try {
      await ensureStaffAuth();
      const { error } = await db.from("subscription_requests").delete().eq("id", id);
      if (error) {
        setAuthError(error.message);
        return;
      }
      setSubscriptions((prev) => prev.filter((s) => String(s.id) !== id));
      await loadRequestsRef.current?.();
    } finally {
      setDeleteBusy(false);
      setPendingId(null);
      setDeleteTarget(null);
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
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-muted-foreground" style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={showLegacyPricing}
              onChange={(e) => setShowLegacyPricing(e.target.checked)}
            />
            {t("إظهار التسعير القديم (اختياري)", "Show legacy pricing (optional)")}
          </label>
        </div>
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
          <p className="text-[#D4AF37]" style={{ fontSize: 24, fontWeight: 600 }}>{totalRevenueLabel}</p>
        </div>
      </div>

      {showLegacyPricing ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[#F5EAD4]" style={{ fontSize: 15, fontWeight: 700 }}>
              {t("التسعير القديم (plan_key) - اختياري", "Legacy pricing (plan_key) - optional")}
            </h2>
            <p className="text-muted-foreground" style={{ fontSize: 12 }}>
              {t(
                "لو بتستخدم نظام الباقات الجديد، تجاهل هذا القسم وخلي التسعير من Variants.",
                "If you use Packages+Variants, ignore this section and price via Variants.",
              )}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="space-y-1">
              <span className="text-muted-foreground" style={{ fontSize: 12 }}>{t("مفتاح الخطة", "Plan key")}</span>
              <input
                value={pricePlanKey}
                onChange={(e) => setPricePlanKey(e.target.value)}
                className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-[#F5EAD4]"
                style={{ fontSize: 13 }}
                placeholder="pro"
                dir="ltr"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("مدة الاشتراك بالأيام", "Duration (days)")}
              </span>
              <input
                value={priceDurationDays}
                onChange={(e) => setPriceDurationDays(Number(e.target.value) || 30)}
                className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-[#F5EAD4]"
                style={{ fontSize: 13 }}
                type="number"
                min={1}
                dir="ltr"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground" style={{ fontSize: 12 }}>{t("العملة", "Currency")}</span>
              <input
                value={priceCurrency}
                onChange={(e) => setPriceCurrency(e.target.value)}
                className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-[#F5EAD4]"
                style={{ fontSize: 13 }}
                placeholder="EGP"
                dir="ltr"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground" style={{ fontSize: 12 }}>{t("السعر", "Price")}</span>
              <input
                value={priceAmount}
                onChange={(e) => setPriceAmount(Number(e.target.value) || 0)}
                className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-[#F5EAD4]"
                style={{ fontSize: 13 }}
                type="number"
                min={0}
                step={0.5}
                dir="ltr"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!live || !db || !hasFirebaseConfig || priceSaving}
              onClick={() => void savePlanPrice()}
              className="inline-flex items-center justify-center rounded-lg bg-[#D4AF37] px-4 py-2 text-[#0B1B14] hover:brightness-110 disabled:opacity-60"
              style={{ fontSize: 13, fontWeight: 800 }}
            >
              {priceSaving ? t("جارٍ الحفظ…", "Saving…") : t("حفظ السعر", "Save price")}
            </button>
            <span className="text-muted-foreground" style={{ fontSize: 12 }}>
              {t("مثال: pro / basic / trial", "Example: pro / basic / trial")}
            </span>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[#F5EAD4]" style={{ fontSize: 15, fontWeight: 700 }}>
            {t("باقات الاشتراك (أسماء حرة + مدد وأسعار)", "Subscription packages (custom names + durations)")}
          </h2>
          <p className="text-muted-foreground" style={{ fontSize: 12 }}>
            {t(
              "هذه الباقات تظهر للمستخدم داخل شاشة تأكيد الاشتراك. عند الموافقة سيتم تطبيقها على حساب المستخدم فورًا.",
              "These packages are shown to users on the mobile confirmation screen. Approval applies them immediately.",
            )}
          </p>
          {packagesError ? (
            <div className="mt-2 text-red-400" style={{ fontSize: 13 }}>
              {packagesError}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-3">
            <div className="mb-2 text-[#F5EAD4]" style={{ fontSize: 13, fontWeight: 700 }}>
              {t("إنشاء/تعديل باقة", "Create / update package")}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={pkgKey}
                onChange={(e) => setPkgKey(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                style={{ fontSize: 12 }}
                placeholder="key (e.g. pro, gold)"
              />
              <label className="flex items-center gap-2 text-muted-foreground" style={{ fontSize: 12 }}>
                <input type="checkbox" checked={pkgActive} onChange={(e) => setPkgActive(e.target.checked)} />
                {t("فعّالة", "Active")}
              </label>
              <input
                value={pkgNameEn}
                onChange={(e) => setPkgNameEn(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                style={{ fontSize: 12 }}
                placeholder={t("اسم EN", "Name (EN)")}
              />
              <input
                value={pkgNameAr}
                onChange={(e) => setPkgNameAr(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                style={{ fontSize: 12 }}
                placeholder={t("اسم AR", "Name (AR)")}
              />
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <textarea
                value={pkgDescEn}
                onChange={(e) => setPkgDescEn(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                style={{ fontSize: 12 }}
                rows={2}
                placeholder={t("وصف EN", "Description (EN)")}
              />
              <textarea
                value={pkgDescAr}
                onChange={(e) => setPkgDescAr(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                style={{ fontSize: 12 }}
                rows={2}
                placeholder={t("وصف AR", "Description (AR)")}
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={!live || pkgSaving}
                onClick={() => void savePackage()}
                className="inline-flex items-center justify-center rounded-lg bg-[#D4AF37] px-4 py-2 text-[#0B1B14] hover:brightness-110 disabled:opacity-60"
                style={{ fontSize: 12, fontWeight: 800 }}
              >
                {pkgSaving ? t("جارٍ الحفظ…", "Saving…") : t("حفظ الباقة", "Save package")}
              </button>
              <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("المفتاح key ثابت ويستخدم كـ plan في profiles.", "The key is stable and becomes profiles.plan.")}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-secondary/20 p-3">
            <div className="mb-2 text-[#F5EAD4]" style={{ fontSize: 13, fontWeight: 700 }}>
              {t("مدة/سعر الباقة (Variant)", "Package variant (duration/price)")}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                value={variantPkgId}
                onChange={(e) => setVariantPkgId(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                style={{ fontSize: 12 }}
              >
                <option value="">{t("اختر باقة", "Select package")}</option>
                {activePackages.map((p) => (
                  <option key={p.packageId} value={p.packageId}>
                    {lang === "ar" ? (p.nameAr || p.name) : p.name} ({p.packageKey})
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-muted-foreground" style={{ fontSize: 12 }}>
                <input type="checkbox" checked={variantActive} onChange={(e) => setVariantActive(e.target.checked)} />
                {t("فعّالة", "Active")}
              </label>
              <input
                value={variantDurationDays}
                onChange={(e) => setVariantDurationDays(Number(e.target.value) || 30)}
                className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                style={{ fontSize: 12 }}
                type="number"
                min={1}
                placeholder={t("مدة الاشتراك بالأيام", "Duration in days")}
              />
              <input
                value={variantCurrency}
                onChange={(e) => setVariantCurrency(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                style={{ fontSize: 12 }}
                placeholder="EGP"
              />
              <input
                value={variantAmount}
                onChange={(e) => setVariantAmount(Number(e.target.value) || 0)}
                className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
                style={{ fontSize: 12 }}
                type="number"
                min={0}
                step={0.5}
                placeholder={t("السعر (مثال: 550)", "Price (e.g. 550)")}
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={!live || variantSaving || !variantPkgId}
                onClick={() => void saveVariant()}
                className="inline-flex items-center justify-center rounded-lg bg-[#D4AF37] px-4 py-2 text-[#0B1B14] hover:brightness-110 disabled:opacity-60"
                style={{ fontSize: 12, fontWeight: 800 }}
              >
                {variantSaving ? t("جارٍ الحفظ…", "Saving…") : t("حفظ المدة", "Save variant")}
              </button>
              <button
                type="button"
                disabled={!live}
                onClick={() => void loadRequestsRef.current?.()}
                className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-muted-foreground hover:text-[#D4AF37] hover:border-[#D4AF37]/30 disabled:opacity-60"
                style={{ fontSize: 12, fontWeight: 700 }}
              >
                {t("تحديث", "Refresh")}
              </button>
              <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("يمكن إضافة أكثر من مدة لنفس الباقة.", "You can add multiple durations per package.")}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-secondary/20 p-3">
          <div className="mb-2 text-[#F5EAD4]" style={{ fontSize: 13, fontWeight: 700 }}>
            {t("صلاحيات/مميزات الباقة (Entitlements)", "Package entitlements (feature flags)")}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={entPkgId}
              onChange={(e) => setEntPkgId(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
              style={{ fontSize: 12 }}
            >
              <option value="">{t("اختر باقة", "Select package")}</option>
              {activePackages.map((p) => (
                <option key={p.packageId} value={p.packageId}>
                  {lang === "ar" ? (p.nameAr || p.name) : p.name} ({p.packageKey})
                </option>
              ))}
            </select>
            <div className="text-muted-foreground" style={{ fontSize: 12 }}>
              {t(
                "اختار المميزات اللي هتكون متاحة للمستخدم في الباقة.",
                "Choose which features are enabled for this package.",
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/50 px-3 py-2">
              <span className="text-[#F5EAD4]" style={{ fontSize: 12, fontWeight: 700 }}>
                {t("خطط التدريب (My plan)", "Training plans (My plan)")}
              </span>
              <input
                type="checkbox"
                checked={entFlags.admin_plans}
                onChange={(e) => setEntFlags((prev) => ({ ...prev, admin_plans: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/50 px-3 py-2">
              <span className="text-[#F5EAD4]" style={{ fontSize: 12, fontWeight: 700 }}>
                {t("التحديات (Challenges)", "Challenges")}
              </span>
              <input
                type="checkbox"
                checked={entFlags.challenges}
                onChange={(e) => setEntFlags((prev) => ({ ...prev, challenges: e.target.checked }))}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-muted-foreground" style={{ fontSize: 12 }}>
              <input
                type="checkbox"
                checked={entShowAdvanced}
                onChange={(e) => setEntShowAdvanced(e.target.checked)}
              />
              {t("إعدادات متقدمة (اختياري)", "Advanced (optional)")}
            </label>
            <span className="text-muted-foreground" style={{ fontSize: 12 }}>
              {t(
                "لن يظهر JSON للأدمن إلا عند تفعيل المتقدم.",
                "JSON stays hidden unless Advanced is enabled.",
              )}
            </span>
          </div>

          {entShowAdvanced ? (
            <textarea
              value={entJson}
              onChange={(e) => setEntJson(e.target.value)}
              className="mt-2 w-full rounded border border-border bg-background px-2 py-2 text-[#F5EAD4]"
              style={{ fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              rows={6}
              spellCheck={false}
            />
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={!live || entSaving || !entPkgId}
              onClick={() => void saveEntitlements()}
              className="inline-flex items-center justify-center rounded-lg bg-[#D4AF37] px-4 py-2 text-[#0B1B14] hover:brightness-110 disabled:opacity-60"
              style={{ fontSize: 12, fontWeight: 800 }}
            >
              {entSaving ? t("جارٍ الحفظ…", "Saving…") : t("حفظ الصلاحيات", "Save entitlements")}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-secondary/20 p-3">
          <div className="mb-2 text-[#F5EAD4]" style={{ fontSize: 13, fontWeight: 700 }}>
            {t("ربط خطط التدريب بالباقة", "Bind training plans to package")}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={bindPkgId}
              onChange={(e) => {
                const next = e.target.value;
                setBindPkgId(next);
              }}
              className="rounded border border-border bg-background px-2 py-1.5 text-[#F5EAD4]"
              style={{ fontSize: 12 }}
            >
              <option value="">{t("اختر باقة", "Select package")}</option>
              {activePackages.map((p) => (
                <option key={p.packageId} value={p.packageId}>
                  {lang === "ar" ? (p.nameAr || p.name) : p.name} ({p.packageKey})
                </option>
              ))}
            </select>
            <div className="text-muted-foreground" style={{ fontSize: 12 }}>
              {t(
                "اختيار الخطط المسموح بها لهذه الباقة (سيتم استخدامها لاحقاً في التعيين/العرض).",
                "Choose the plans allowed for this package (used later for assignment/display).",
              )}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            {trainingPlans.length === 0 ? (
              <div className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("لا توجد خطط تدريب حالياً.", "No training plans found.")}
              </div>
            ) : (
              trainingPlans.map((p) => {
                const checked = boundPlanIds.has(p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-card/50 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(boundPlanIds);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setBoundPlanIds(next);
                      }}
                    />
                    <span className="text-[#F5EAD4]" style={{ fontSize: 12, fontWeight: 600 }}>
                      {p.title}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={!live || bindingsSaving || !bindPkgId}
              onClick={() => void savePlanBindings()}
              className="inline-flex items-center justify-center rounded-lg bg-[#D4AF37] px-4 py-2 text-[#0B1B14] hover:brightness-110 disabled:opacity-60"
              style={{ fontSize: 12, fontWeight: 800 }}
            >
              {bindingsSaving ? t("جارٍ الحفظ…", "Saving…") : t("حفظ ربط الخطط", "Save plan bindings")}
            </button>
          </div>
        </div>

        {packages.filter((p) => p.packageActive).length ? (
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-3">
            <div className="mb-2 text-[#F5EAD4]" style={{ fontSize: 13, fontWeight: 700 }}>
              {t("الباقات الحالية", "Existing packages")}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {packages.filter((p) => p.packageActive).map((p) => (
                <div key={p.packageId} className="rounded-md border border-border/60 bg-card/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[#F5EAD4]" style={{ fontSize: 13, fontWeight: 700 }}>
                        {lang === "ar" ? (p.nameAr || p.name) : p.name}
                        <span className="text-muted-foreground" style={{ fontWeight: 500 }}> · {p.packageKey}</span>
                      </div>
                      {p.description ? (
                        <div className="text-muted-foreground" style={{ fontSize: 11 }}>
                          {lang === "ar" ? (p.descriptionAr || p.description) : p.description}
                        </div>
                      ) : null}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full ${p.packageActive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`} style={{ fontSize: 11 }}>
                      {p.packageActive ? t("نشطة", "Active") : t("موقوفة", "Inactive")}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.variants.map((v) => (
                      <span key={v.variantId} className="rounded-full border border-border px-2 py-0.5 text-muted-foreground" style={{ fontSize: 11 }}>
                        {v.durationDays}d · {(v.priceCents / 100).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")} {v.currency}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setDeletePkgId(p.packageId)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-red-400 hover:border-red-500/40 hover:bg-red-500/10"
                      style={{ fontSize: 12, fontWeight: 800 }}
                      title={t("حذف الباقة", "Delete package")}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      {t("حذف", "Delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-border">
              {[t("المستخدم", "User"), t("الخطة", "Plan"), t("الحالة", "Status"), t("المبلغ", "Amount"), t("المدرب", "Coach"), t("التجديد", "Renew"), t("إجراءات", "Actions")].map((h) => (
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
                <td className="px-4 py-3 text-muted-foreground">
                  {s.amount.toLocaleString(lang === "ar" ? "ar-EG" : "en-US", { maximumFractionDigits: 2 })}{" "}
                  {(s.currency || metricsRevenue?.currency || "EGP").toUpperCase()}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {s.preferredCoachName ?? (s.preferredCoachId ? t("مدرب", "Coach") : "—")}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(s.renewDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleStatus(s)}
                      disabled={pendingId === s.id}
                      className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-[#D4AF37] hover:border-[#D4AF37]/30 disabled:opacity-50"
                      style={{ fontSize: 12 }}
                    >
                      {s.status === "approved" ? t("رفض", "Reject") : t("تفعيل", "Approve")}
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(s)}
                      disabled={pendingId === s.id}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-red-400 hover:border-red-500/40 hover:bg-red-500/10 disabled:opacity-50"
                      style={{ fontSize: 12 }}
                      title={t("حذف الطلب", "Delete request")}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      {t("حذف", "Delete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && !deleteBusy && setDeleteTarget(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#F5EAD4]">
              {t("تأكيد حذف الطلب", "Confirm delete request")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {t(
                    "سيتم حذف طلب الاشتراك نهائياً. لا يمكن التراجع.",
                    "This subscription request will be permanently deleted. This cannot be undone.",
                  )}
                </p>
                {deleteTarget ? (
                  <p className="text-[#F5EAD4]" style={{ fontSize: 13 }}>
                    <span className="font-medium">{deleteTarget.userName}</span>
                    <span className="text-muted-foreground"> · {deleteTarget.userEmail}</span>
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy} className="border-border">
              {t("إلغاء", "Cancel")}
            </AlertDialogCancel>
            <button
              type="button"
              disabled={deleteBusy}
              onClick={() => void confirmDeleteRequest()}
              className="inline-flex h-9 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {deleteBusy ? t("جارٍ الحذف…", "Deleting…") : t("حذف نهائي", "Delete permanently")}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletePkgId !== null} onOpenChange={(open) => !open && !deletePkgBusy && setDeletePkgId(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#F5EAD4]">
              {t("تأكيد حذف الباقة", "Confirm delete package")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {t(
                    "سيتم إيقاف الباقة وإخفاؤها من التطبيق ولوحة التحكم، مع إيقاف كل الأسعار (variants) التابعة لها.",
                    "The package will be deactivated and hidden from both the app and dashboard, and all its variants will be disabled.",
                  )}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePkgBusy} className="border-border">
              {t("إلغاء", "Cancel")}
            </AlertDialogCancel>
            <button
              type="button"
              disabled={deletePkgBusy}
              onClick={() => void confirmDeletePackage()}
              className="inline-flex h-9 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {deletePkgBusy ? t("جارٍ الحذف…", "Deleting…") : t("حذف نهائي", "Delete")}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
