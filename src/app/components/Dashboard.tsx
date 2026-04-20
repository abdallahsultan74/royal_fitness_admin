import {
  Users,
  DollarSign,
  Trophy,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowUpLeft,
  ArrowUpRight,
  Eye,
  Flame,
  Clock,
  Footprints,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { useLang } from "./LanguageContext";
import { db, ensureStaffAuth, hasFirebaseConfig } from "../firebase";
import { useNavigate } from "react-router";

export function Dashboard() {
  const { t, isRTL } = useLang();
  const navigate = useNavigate();
  const [usersCount, setUsersCount] = useState<number | null>(null);
  const [exercisesCount, setExercisesCount] = useState<number | null>(null);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [revenueCurrency, setRevenueCurrency] = useState<string>("EGP");
  const [recentUsers, setRecentUsers] = useState<{ id?: string; name: string; plan: string; time: string }[]>([]);
  // Activity details are now shown on a dedicated user details page.
  const [chartData, setChartData] = useState<{ month: string; users: number; revenue: number }[]>([]);
  const [pendingRequests, setPendingRequests] = useState<number | null>(null);
  const [avgBmi, setAvgBmi] = useState<number | null>(null);
  const [todayWeightLogs, setTodayWeightLogs] = useState<number | null>(null);
  const [activeChallenges, setActiveChallenges] = useState<number | null>(null);
  const [platformTodayCalories, setPlatformTodayCalories] = useState<number | null>(null);
  const [platformTodayMinutes, setPlatformTodayMinutes] = useState<number | null>(null);
  const [platformTodaySteps, setPlatformTodaySteps] = useState<number | null>(null);
  const [profilesWithBmiCount, setProfilesWithBmiCount] = useState<number | null>(null);
  const [activeChallengeTemplates, setActiveChallengeTemplates] = useState<number | null>(null);
  const [activePlanAssignments, setActivePlanAssignments] = useState<number | null>(null);
  const [dataLive, setDataLive] = useState(false);

  useEffect(() => {
    if (!db || !hasFirebaseConfig) return;
    let usersChannel: ReturnType<typeof db.channel> | null = null;
    let exercisesChannel: ReturnType<typeof db.channel> | null = null;
    let requestsChannel: ReturnType<typeof db.channel> | null = null;
    let cancelled = false;

    const loadDashboard = async () => {
      if (!db) return;
      const dashResp = await db.rpc("api_admin_dashboard_metrics", { p_days: 30 });
      if (dashResp.error) {
        console.error("[Dashboard] api_admin_dashboard_metrics", dashResp.error);
      } else {
        const row = Array.isArray(dashResp.data) ? dashResp.data[0] : dashResp.data;
        const revCents = Number(row?.revenue_cents ?? 0) || 0;
        setRevenue(revCents / 100);
        setRevenueCurrency(String(row?.currency ?? "EGP") || "EGP");
        if (typeof row?.total_users === "number") setUsersCount(row.total_users);
        if (typeof row?.pending_subscription_requests === "number") {
          setPendingRequests(row.pending_subscription_requests);
        }
      }

      const usersResp = await db.from("profiles").select("*");
      if (usersResp.error) {
        console.error("[Dashboard] profiles", usersResp.error);
        setDataLive(false);
        return;
      }
      const usersRaw = usersResp.data ?? [];
      const progressResp = await db.rpc("api_admin_user_progress_summary");
      const progressRows = (progressResp.data ?? []) as any[];
      const users = usersRaw.map((data) => {
        const createdAtRaw = data.created_at?.toString();
        const createdAt = createdAtRaw ? new Date(createdAtRaw) : new Date();
        return {
          id: data.id?.toString(),
          name: data.name ?? (isRTL ? "مستخدم" : "User"),
          plan: data.plan ?? t("تجريبي", "Trial"),
          createdAt,
        };
      });

      setUsersCount(users.length);
      const exercisesResp = await db.from("exercises").select("id");
      setExercisesCount((exercisesResp.data ?? []).length);
      const requestsResp = await db.from("subscription_requests").select("id").eq("status", "pending");
      setPendingRequests((requestsResp.data ?? []).length);
      const todayKey = new Date().toISOString().slice(0, 10);
      const weightLogsResp = await db.from("weight_logs").select("id").eq("logged_at", todayKey);
      setTodayWeightLogs((weightLogsResp.data ?? []).length);
      const bmiValues = progressRows
        .map((row) => Number(row.bmi))
        .filter((value) => Number.isFinite(value) && value > 0);
      setAvgBmi(
        bmiValues.length
          ? Number((bmiValues.reduce((sum, value) => sum + value, 0) / bmiValues.length).toFixed(1))
          : 0,
      );
      setActiveChallenges(
        progressRows.filter((row) => String(row.challenge_status ?? "") === "active").length,
      );

      const dailyStatsResp = await db
        .from("daily_stats")
        .select("total_calories, total_minutes, steps")
        .eq("date_key", todayKey);
      if (dailyStatsResp.error) {
        console.error("[Dashboard] daily_stats", dailyStatsResp.error);
        setPlatformTodayCalories(null);
        setPlatformTodayMinutes(null);
        setPlatformTodaySteps(null);
      } else {
        const dsRows = (dailyStatsResp.data ?? []) as Array<{
          total_calories?: number | string | null;
          total_minutes?: number | string | null;
          steps?: number | string | null;
        }>;
        setPlatformTodayCalories(
          dsRows.reduce((acc, r) => acc + (Number(r.total_calories) || 0), 0),
        );
        setPlatformTodayMinutes(
          dsRows.reduce((acc, r) => acc + (Number(r.total_minutes) || 0), 0),
        );
        setPlatformTodaySteps(dsRows.reduce((acc, r) => acc + (Number(r.steps) || 0), 0));
      }

      setProfilesWithBmiCount(bmiValues.length);

      const templatesCountResp = await db
        .from("challenge_templates")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      if (templatesCountResp.error) {
        console.error("[Dashboard] challenge_templates count", templatesCountResp.error);
        setActiveChallengeTemplates(null);
      } else {
        setActiveChallengeTemplates(templatesCountResp.count ?? 0);
      }

      const assignmentsCountResp = await db
        .from("plan_assignments")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");
      if (assignmentsCountResp.error) {
        console.error("[Dashboard] plan_assignments count", assignmentsCountResp.error);
        setActivePlanAssignments(null);
      } else {
        setActivePlanAssignments(assignmentsCountResp.count ?? 0);
      }

      // Revenue is computed server-side based on admin/coach plan prices.

      const sortedUsers = [...users].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const now = Date.now();
      const formatter = new Intl.RelativeTimeFormat(isRTL ? "ar" : "en", { numeric: "auto" });
      setRecentUsers(
        sortedUsers.slice(0, 5).map((user) => {
          const minutesAgo = Math.max(1, Math.round((now - user.createdAt.getTime()) / (1000 * 60)));
          return {
            id: user.id,
            name: user.name,
            plan: user.plan,
            time: formatter.format(-minutesAgo, "minute"),
          };
        }),
      );

      const buckets = Array.from({ length: 6 }, (_, idx) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (5 - idx));
        return {
          key: `${date.getFullYear()}-${date.getMonth()}`,
          date,
          users: 0,
          revenue: 0,
        };
      });

      users.forEach((user) => {
        const key = `${user.createdAt.getFullYear()}-${user.createdAt.getMonth()}`;
        const bucket = buckets.find((item) => item.key === key);
        if (!bucket) return;
        bucket.users += 1;
      });

      // Revenue trend: sum approved subscription_requests by month (uses stored price at approval).
      const start = new Date();
      start.setMonth(start.getMonth() - 5);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const revResp = await db
        .from("subscription_requests")
        .select("approved_at, price_cents")
        .eq("status", "approved")
        .gte("approved_at", start.toISOString());
      if (revResp.error) {
        console.error("[Dashboard] subscription_requests revenue trend", revResp.error);
      } else {
        const revRows = (revResp.data ?? []) as any[];
        revRows.forEach((r) => {
          const atRaw = r.approved_at?.toString();
          if (!atRaw) return;
          const at = new Date(atRaw);
          if (Number.isNaN(at.getTime())) return;
          const key = `${at.getFullYear()}-${at.getMonth()}`;
          const bucket = buckets.find((b) => b.key === key);
          if (!bucket) return;
          bucket.revenue += (Number(r.price_cents ?? 0) || 0) / 100;
        });
      }

      setChartData(
        buckets.map((bucket) => ({
          month: bucket.date.toLocaleDateString(isRTL ? "ar" : "en", { month: "short" }),
          users: bucket.users,
          revenue: bucket.revenue,
        })),
      );
      setDataLive(true);
    };

    ensureStaffAuth().then((authed) => {
      if (!authed || cancelled) {
        setDataLive(false);
        return;
      }
      loadDashboard();

      usersChannel = db
        .channel("profiles-live-dashboard")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles" },
          () => loadDashboard(),
        )
        .subscribe();
      exercisesChannel = db
        .channel("exercises-live-dashboard")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "exercises" },
          () => loadDashboard(),
        )
        .subscribe();
      requestsChannel = db
        .channel("subscription-requests-dashboard")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "subscription_requests" },
          () => loadDashboard(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (usersChannel) db.removeChannel(usersChannel);
      if (exercisesChannel) db.removeChannel(exercisesChannel);
      if (requestsChannel) db.removeChannel(requestsChannel);
    };
  }, [isRTL, t]);

  const fallbackChartData = useMemo(
    () => [
      { month: t("يناير", "Jan"), users: 4200, revenue: 28000 },
      { month: t("فبراير", "Feb"), users: 5100, revenue: 31000 },
      { month: t("مارس", "Mar"), users: 4800, revenue: 29500 },
      { month: t("أبريل", "Apr"), users: 6200, revenue: 35000 },
      { month: t("مايو", "May"), users: 7100, revenue: 38000 },
      { month: t("يونيو", "Jun"), users: 6800, revenue: 36500 },
      { month: t("يوليو", "Jul"), users: 8200, revenue: 42000 },
      { month: t("أغسطس", "Aug"), users: 9100, revenue: 44000 },
      { month: t("سبتمبر", "Sep"), users: 8700, revenue: 41500 },
      { month: t("أكتوبر", "Oct"), users: 10200, revenue: 46000 },
      { month: t("نوفمبر", "Nov"), users: 11400, revenue: 47500 },
      { month: t("ديسمبر", "Dec"), users: 12847, revenue: 48290 },
    ],
    [t],
  );

  const fallbackRecentUsers = useMemo(
    () => [
      { name: t("أحمد حسن", "Ahmed Hassan"), plan: t("بريميوم", "Pro"), time: t("منذ ٢ دقيقة", "2 min ago") },
      { name: t("سارة الراشد", "Sara Al-Rashid"), plan: t("تجريبي", "Trial"), time: t("منذ ١٥ دقيقة", "15 min ago") },
      { name: t("عمر خليل", "Omar Khalil"), plan: t("بريميوم", "Pro"), time: t("منذ ساعة", "1 hr ago") },
      { name: t("فاطمة نور", "Fatima Noor"), plan: t("أساسي", "Basic"), time: t("منذ ٣ ساعات", "3 hrs ago") },
      { name: t("يوسف كريم", "Youssef Karim"), plan: t("بريميوم", "Pro"), time: t("منذ ٥ ساعات", "5 hrs ago") },
    ],
    [t],
  );

  const revenueLabel = useMemo(() => {
    const nf = new Intl.NumberFormat(isRTL ? "ar" : "en", {
      maximumFractionDigits: 2,
    });
    const v = revenue ?? 0;
    const cur = (revenueCurrency || "EGP").toUpperCase();
    return `${nf.format(v)} ${cur}`;
  }, [isRTL, revenue, revenueCurrency]);

  const metrics = [
    { label: t("إجمالي المستخدمين", "Total Users"), value: usersCount ?? 12847, change: t("مباشر", "Live"), up: true, icon: Users, href: "/users" },
    { label: t("إيرادات الاشتراكات", "Subscription Revenue"), value: revenue != null ? revenueLabel : `$${revenue ?? 48290}`, change: t("حقيقي", "Actual"), up: true, icon: DollarSign, href: "/subscriptions" },
    { label: t("التمارين النشطة", "Active Exercises"), value: exercisesCount ?? 34, change: t("مباشر", "Live"), up: true, icon: Trophy, href: "/exercises" },
    { label: t("طلبات الاشتراك", "Subscription Requests"), value: pendingRequests ?? 0, change: t("قيد المراجعة", "Pending"), up: false, icon: AlertTriangle, href: "/subscriptions" },
    { label: t("متوسط BMI", "Average BMI"), value: avgBmi ?? "--", change: t("صحي", "Health"), up: true, icon: TrendingUp, href: "/users" },
    { label: t("تحديثات وزن اليوم", "Today's weight logs"), value: todayWeightLogs ?? 0, change: t("مباشر", "Live"), up: true, icon: TrendingUp, href: "/users" },
    { label: t("تحديات نشطة", "Active challenges"), value: activeChallenges ?? 0, change: t("30 يوم", "30-day"), up: true, icon: Trophy, href: "/challenges" },
  ];
  const tableRecentUsers = recentUsers.length ? recentUsers : fallbackRecentUsers;
  const renderedChartData = chartData.length ? chartData : fallbackChartData;

  const planPro = t("بريميوم", "Pro");
  const planTrial = t("تجريبي", "Trial");

  return (
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="min-w-0">
        <h1 className="text-xl text-[#F5EAD4] sm:text-2xl md:text-3xl">{t("لوحة التحكم", "Dashboard")}</h1>
        <p className="text-muted-foreground text-sm sm:text-[14px]">
          {t(
            "مرحباً بعودتك، مدير النظام. إليك نظرة عامة على إمبراطورية اللياقة الخاصة بك.",
            "Welcome back, Royal Admin. Here's your fitness empire overview."
          )}{" "}
          ·{" "}
          <span className={dataLive ? "text-emerald-400" : "text-amber-400"}>
            {dataLive ? t("بيانات حية + Realtime", "Live data + realtime") : t("في انتظار الاتصال…", "Waiting for data…")}
          </span>
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {metrics.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={() => {
              if ("href" in m && m.href) navigate(m.href);
            }}
            className="relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-[#D4AF37]/30 hover:shadow-[0_0_20px_rgba(212,175,55,0.05)] sm:p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs sm:text-[12px]">{m.label}</p>
                <p className="mt-1 truncate text-[#F5EAD4] text-[1.35rem] font-semibold sm:text-[1.65rem] md:text-[28px]">
                  {m.value}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center">
                <m.icon className="w-5 h-5 text-[#D4AF37]" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1">
              {m.up ? (
                <TrendingUp className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              )}
              <span className="text-emerald-400 text-xs sm:text-[12px]">{m.change}</span>
              <span className="text-muted-foreground text-xs sm:text-[12px]">
                {t("مقارنة بالشهر الماضي", "vs last month")}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs sm:text-[12px]">
            <Flame className="h-4 w-4 shrink-0 text-[#D4AF37]" />
            {t("نشاط المنصّة اليوم — السعرات", "Platform today — calories")}
          </div>
          <p className="mt-2 truncate text-[#F5EAD4] text-2xl font-semibold sm:text-[26px]">
            {platformTodayCalories != null ? platformTodayCalories.toLocaleString() : "—"}
          </p>
          <p className="text-muted-foreground mt-1 text-[11px] sm:text-xs">
            {t("مجموع daily_stats لتاريخ اليوم", "Sum of daily_stats for today")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs sm:text-[12px]">
            <Clock className="h-4 w-4 shrink-0 text-emerald-400" />
            {t("الدقائق / الخطوات", "Minutes / steps")}
          </div>
          <p className="mt-2 text-[#F5EAD4] text-lg font-semibold sm:text-xl">
            {platformTodayMinutes != null ? platformTodayMinutes.toLocaleString() : "—"}{" "}
            <span className="text-muted-foreground text-sm font-normal">min</span>
          </p>
          <p className="mt-1 text-[#F5EAD4] text-lg font-semibold sm:text-xl">
            {platformTodaySteps != null ? platformTodaySteps.toLocaleString() : "—"}{" "}
            <span className="text-muted-foreground text-sm font-normal">steps</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/users")}
          className="rounded-xl border border-border bg-card p-4 text-start transition-colors hover:border-[#D4AF37]/30 sm:p-5"
        >
          <div className="flex items-center gap-2 text-muted-foreground text-xs sm:text-[12px]">
            <Target className="h-4 w-4 shrink-0 text-[#D4AF37]" />
            {t("BMI في الملفات", "BMI on record")}
          </div>
          <p className="mt-2 text-[#F5EAD4] text-2xl font-semibold sm:text-[26px]">
            {profilesWithBmiCount != null ? profilesWithBmiCount.toLocaleString() : "—"}
          </p>
          <p className="text-muted-foreground mt-2 text-[11px] sm:text-xs">
            {t("متوسط BMI:", "Avg BMI:")}{" "}
            <span className="text-[#F5EAD4]">{avgBmi && avgBmi > 0 ? avgBmi : "—"}</span> ·{" "}
            {t("عرض المستخدمين →", "View users →")}
          </p>
        </button>
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => navigate("/challenges")}
            className="rounded-xl border border-border bg-card p-4 text-start transition-colors hover:border-[#D4AF37]/30 sm:p-5"
          >
            <div className="flex items-center gap-2 text-muted-foreground text-xs sm:text-[12px]">
              <Trophy className="h-4 w-4 shrink-0 text-[#D4AF37]" />
              {t("قوالب التحديات النشطة", "Active challenge templates")}
            </div>
            <p className="mt-2 text-[#F5EAD4] text-xl font-semibold">
              {activeChallengeTemplates != null ? activeChallengeTemplates : "—"}
            </p>
            <p className="text-muted-foreground mt-1 text-[11px]">{t("إدارة التحديات →", "Manage challenges →")}</p>
          </button>
          <button
            type="button"
            onClick={() => navigate("/plans")}
            className="rounded-xl border border-border bg-card p-4 text-start transition-colors hover:border-[#D4AF37]/30 sm:p-5"
          >
            <div className="flex items-center gap-2 text-muted-foreground text-xs sm:text-[12px]">
              <Footprints className="h-4 w-4 shrink-0 text-emerald-400" />
              {t("إسنادات الخطط النشطة", "Active plan assignments")}
            </div>
            <p className="mt-2 text-[#F5EAD4] text-xl font-semibold">
              {activePlanAssignments != null ? activePlanAssignments : "—"}
            </p>
            <p className="text-muted-foreground mt-1 text-[11px]">{t("الخطط والـ JSON →", "Plans & JSON →")}</p>
          </button>
        </div>
      </div>

      {/* Chart + Recent */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5 lg:col-span-2" dir="ltr">
          <div
            className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-y-2"
            dir={isRTL ? "rtl" : "ltr"}
          >
            <div className="min-w-0">
              <h3 className="text-base text-[#F5EAD4] sm:text-lg">{t("نشاط المستخدمين", "User Activity")}</h3>
              <p className="text-muted-foreground text-xs sm:text-[13px]">
                {t("التسجيلات الشهرية واتجاه الإيرادات", "Monthly signups & revenue trend")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#D4AF37]" />
                <span className="text-muted-foreground text-xs sm:text-[12px]">{t("المستخدمون", "Users")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" />
                <span className="text-muted-foreground text-xs sm:text-[12px]">{t("الإيرادات", "Revenue")}</span>
              </div>
            </div>
          </div>
          <div className="h-[220px] w-full sm:h-[260px] md:h-[300px] lg:h-[280px] xl:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={renderedChartData}>
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2ecc71" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#2ecc71" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
              <XAxis dataKey="month" tick={{ fill: "#a8997e", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#a8997e", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#01311f",
                  border: "1px solid rgba(212,175,55,0.2)",
                  borderRadius: 8,
                  color: "#F5EAD4",
                  fontSize: 13,
                }}
              />
              <Area type="monotone" dataKey="users" stroke="#D4AF37" strokeWidth={2} fill="url(#goldGrad)" name={t("المستخدمون", "Users")} />
              <Area type="monotone" dataKey="revenue" stroke="#2ecc71" strokeWidth={2} fill="url(#greenGrad)" name={t("الإيرادات", "Revenue")} />
            </AreaChart>
          </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="min-w-0 text-base text-[#F5EAD4] sm:text-lg">{t("أحدث التسجيلات", "Recent Signups")}</h3>
            <button type="button" className="flex shrink-0 cursor-pointer items-center gap-1 text-[#D4AF37] text-xs sm:text-[12px]">
              {t("عرض الكل", "View All")}
              {isRTL ? <ArrowUpLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="space-y-3">
            {tableRecentUsers.map((u) => (
              <div key={u.name + u.time} className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-secondary/60">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#D4AF37]/30 bg-secondary text-[#D4AF37]" style={{ fontSize: 11, fontWeight: 600 }}>
                  {u.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[#F5EAD4]" style={{ fontSize: 13 }}>{u.name}</p>
                  <p className="text-muted-foreground" style={{ fontSize: 11 }}>{u.time}</p>
                </div>
                {u.id ? (
                  <button
                    type="button"
                    title={t("عرض النشاط", "View activity")}
                    className="shrink-0 rounded-lg border border-[#D4AF37]/40 p-2 text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/15"
                    onClick={() => navigate(`/users/${u.id}`)}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                ) : null}
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full ${
                    u.plan === planPro
                      ? "bg-[#D4AF37]/10 text-[#D4AF37]"
                      : u.plan === planTrial
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-secondary text-muted-foreground"
                  }`}
                  style={{ fontSize: 11 }}
                >
                  {u.plan}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
