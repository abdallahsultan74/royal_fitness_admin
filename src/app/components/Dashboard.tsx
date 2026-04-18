import {
  Users,
  DollarSign,
  Trophy,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowUpLeft,
  ArrowUpRight,
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
import { db, ensureAdminAuth, hasFirebaseConfig } from "../firebase";

export function Dashboard() {
  const { t, isRTL } = useLang();
  const [usersCount, setUsersCount] = useState<number | null>(null);
  const [exercisesCount, setExercisesCount] = useState<number | null>(null);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [recentUsers, setRecentUsers] = useState<{ name: string; plan: string; time: string }[]>([]);
  const [chartData, setChartData] = useState<{ month: string; users: number; revenue: number }[]>([]);
  const [pendingRequests, setPendingRequests] = useState<number | null>(null);
  const [avgBmi, setAvgBmi] = useState<number | null>(null);
  const [todayWeightLogs, setTodayWeightLogs] = useState<number | null>(null);
  const [activeChallenges, setActiveChallenges] = useState<number | null>(null);

  useEffect(() => {
    if (!db || !hasFirebaseConfig) return;
    let usersChannel: ReturnType<typeof db.channel> | null = null;
    let exercisesChannel: ReturnType<typeof db.channel> | null = null;
    let requestsChannel: ReturnType<typeof db.channel> | null = null;
    let cancelled = false;

    const loadDashboard = async () => {
      if (!db) return;
      const usersResp = await db.from("profiles").select("*");
      const usersRaw = usersResp.data ?? [];
      const progressResp = await db.rpc("api_admin_user_progress_summary");
      const progressRows = (progressResp.data ?? []) as any[];
      const users = usersRaw.map((data) => {
        const createdAtRaw = data.created_at?.toString();
        const createdAt = createdAtRaw ? new Date(createdAtRaw) : new Date();
        return {
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

      const revenueTotal = users.reduce((sum, user) => {
        const plan = String(user.plan).toLowerCase();
        if (plan.includes("pro") || plan.includes("premium") || plan.includes("بريميوم")) return sum + 49;
        if (plan.includes("basic") || plan.includes("أساسي")) return sum + 19;
        return sum;
      }, 0);
      setRevenue(revenueTotal);

      const sortedUsers = [...users].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const now = Date.now();
      const formatter = new Intl.RelativeTimeFormat(isRTL ? "ar" : "en", { numeric: "auto" });
      setRecentUsers(
        sortedUsers.slice(0, 5).map((user) => {
          const minutesAgo = Math.max(1, Math.round((now - user.createdAt.getTime()) / (1000 * 60)));
          return {
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
        const plan = String(user.plan).toLowerCase();
        if (plan.includes("pro") || plan.includes("premium") || plan.includes("بريميوم")) bucket.revenue += 49;
        else if (plan.includes("basic") || plan.includes("أساسي")) bucket.revenue += 19;
      });

      setChartData(
        buckets.map((bucket) => ({
          month: bucket.date.toLocaleDateString(isRTL ? "ar" : "en", { month: "short" }),
          users: bucket.users,
          revenue: bucket.revenue,
        })),
      );
    };

    ensureAdminAuth().then((authed) => {
      if (!authed || cancelled) return;
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

  const metrics = [
    { label: t("إجمالي المستخدمين", "Total Users"), value: usersCount ?? 12847, change: t("مباشر", "Live"), up: true, icon: Users },
    { label: t("إيرادات الاشتراكات", "Subscription Revenue"), value: `$${revenue ?? 48290}`, change: t("تقديري", "Estimated"), up: true, icon: DollarSign },
    { label: t("التمارين النشطة", "Active Exercises"), value: exercisesCount ?? 34, change: t("مباشر", "Live"), up: true, icon: Trophy },
    { label: t("طلبات الاشتراك", "Subscription Requests"), value: pendingRequests ?? 0, change: t("قيد المراجعة", "Pending"), up: false, icon: AlertTriangle },
    { label: t("متوسط BMI", "Average BMI"), value: avgBmi ?? "--", change: t("صحي", "Health"), up: true, icon: TrendingUp },
    { label: t("تحديثات وزن اليوم", "Today's weight logs"), value: todayWeightLogs ?? 0, change: t("مباشر", "Live"), up: true, icon: TrendingUp },
    { label: t("تحديات نشطة", "Active challenges"), value: activeChallenges ?? 0, change: t("30 يوم", "30-day"), up: true, icon: Trophy },
  ];
  const tableRecentUsers = recentUsers.length ? recentUsers : fallbackRecentUsers;
  const renderedChartData = chartData.length ? chartData : fallbackChartData;

  const planPro = t("بريميوم", "Pro");
  const planTrial = t("تجريبي", "Trial");

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="min-w-0">
        <h1 className="text-xl text-[#F5EAD4] sm:text-2xl md:text-3xl">{t("لوحة التحكم", "Dashboard")}</h1>
        <p className="text-muted-foreground text-sm sm:text-[14px]">
          {t(
            "مرحباً بعودتك، مدير النظام. إليك نظرة عامة على إمبراطورية اللياقة الخاصة بك.",
            "Welcome back, Royal Admin. Here's your fitness empire overview."
          )}
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {metrics.map((m) => (
          <div
            key={m.label}
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
          </div>
        ))}
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
              <div key={u.name} className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/60 transition-colors">
                <div className="w-9 h-9 rounded-full border border-[#D4AF37]/30 bg-secondary flex items-center justify-center text-[#D4AF37]" style={{ fontSize: 11, fontWeight: 600 }}>
                  {u.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#F5EAD4] truncate" style={{ fontSize: 13 }}>{u.name}</p>
                  <p className="text-muted-foreground" style={{ fontSize: 11 }}>{u.time}</p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full ${
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
