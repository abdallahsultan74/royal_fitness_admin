import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLang } from "./LanguageContext";
import { db, ensureStaffAuth, getIsAdmin, hasFirebaseConfig } from "../firebase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type RangePreset = "7" | "30" | "90" | "custom";

type RevenueDailyRow = { day: string; approved_count: number; revenue_cents: number; currency: string };
type UsersDailyRow = { day: string; new_users: number; active_users: number; deleted_users: number };
type WorkoutsDailyRow = {
  day: string;
  total_minutes: number;
  total_calories: number;
  total_steps: number;
  total_sessions: number;
  active_users: number;
};
type TopUserRow = {
  user_id: string;
  name: string;
  email: string;
  total_minutes: number;
  total_calories: number;
  total_steps: number;
  total_sessions: number;
};

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfDayUtcIso(dayIso: string) {
  return `${dayIso}T00:00:00.000Z`;
}

function endOfDayUtcIso(dayIso: string) {
  return `${dayIso}T23:59:59.999Z`;
}

export function AnalyticsPage() {
  const { lang, t } = useLang();
  const navigate = useNavigate();

  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preset, setPreset] = useState<RangePreset>("30");
  const [fromDay, setFromDay] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return isoDay(d);
  });
  const [toDay, setToDay] = useState(() => isoDay(new Date()));

  const [loading, setLoading] = useState(false);
  const [revenueDaily, setRevenueDaily] = useState<RevenueDailyRow[]>([]);
  const [usersDaily, setUsersDaily] = useState<UsersDailyRow[]>([]);
  const [workoutsDaily, setWorkoutsDaily] = useState<WorkoutsDailyRow[]>([]);
  const [topUsers, setTopUsers] = useState<TopUserRow[]>([]);
  const [challengesSummary, setChallengesSummary] = useState<{ active_count: number; completed_count: number; avg_progress_percent: number } | null>(null);
  const [plansSummary, setPlansSummary] = useState<{ active_assignments: number; ended_assignments: number; total_assignments: number } | null>(null);
  const [notifSummary, setNotifSummary] = useState<{ user_notifications: number; user_messages: number; admin_notifications: number } | null>(null);

  useEffect(() => {
    if (!db || !hasFirebaseConfig) {
      setError("Missing Supabase config in environment.");
      setForbidden(true);
      return;
    }

    let cancelled = false;
    ensureStaffAuth().then(async (authed) => {
      if (!authed || cancelled) {
        setForbidden(true);
        return;
      }
      const isAdmin = await getIsAdmin();
      if (!isAdmin) {
        setForbidden(true);
        return;
      }
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const applyPreset = (p: RangePreset) => {
    setPreset(p);
    if (p === "custom") return;
    const days = Number(p);
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setFromDay(isoDay(from));
    setToDay(isoDay(to));
  };

  const range = useMemo(() => {
    const fromIso = startOfDayUtcIso(fromDay);
    const toIso = endOfDayUtcIso(toDay);
    return { fromIso, toIso };
  }, [fromDay, toDay]);

  const loadAll = async () => {
    if (!db) return;
    setLoading(true);
    setError(null);
    try {
      const p_from = range.fromIso;
      const p_to = range.toIso;
      const p_days = preset === "custom" ? 30 : Number(preset);

      const [
        revResp,
        usersResp,
        workoutsResp,
        topResp,
        chResp,
        plansResp,
        notifResp,
      ] = await Promise.all([
        db.rpc("api_admin_analytics_revenue_daily", { p_from, p_to, p_days }),
        db.rpc("api_admin_analytics_users_daily", { p_from, p_to, p_days }),
        db.rpc("api_admin_analytics_workouts_daily", { p_from, p_to, p_days }),
        db.rpc("api_admin_analytics_workouts_top_users", { p_from, p_to, p_days, p_limit: 10 }),
        db.rpc("api_admin_analytics_challenges_summary", { p_from, p_to, p_days }),
        db.rpc("api_admin_analytics_plans_summary", { p_from, p_to, p_days }),
        db.rpc("api_admin_analytics_notifications_summary", { p_from, p_to, p_days }),
      ]);

      const err = revResp.error || usersResp.error || workoutsResp.error || topResp.error || chResp.error || plansResp.error || notifResp.error;
      if (err) throw err;

      setRevenueDaily((revResp.data ?? []) as any);
      setUsersDaily((usersResp.data ?? []) as any);
      setWorkoutsDaily((workoutsResp.data ?? []) as any);
      setTopUsers((topResp.data ?? []) as any);
      setChallengesSummary(Array.isArray(chResp.data) ? (chResp.data[0] as any) : (chResp.data as any));
      setPlansSummary(Array.isArray(plansResp.data) ? (plansResp.data[0] as any) : (plansResp.data as any));
      setNotifSummary(Array.isArray(notifResp.data) ? (notifResp.data[0] as any) : (notifResp.data as any));
    } catch (e: any) {
      setError(e?.message ? String(e.message) : String(e));
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = (filename: string, rows: Record<string, any>[]) => {
    const cols = Array.from(
      new Set(rows.flatMap((r) => Object.keys(r))),
    );
    const esc = (v: any) => {
      const s = v === null || v === undefined ? "" : String(v);
      if (/[\",\\n]/.test(s)) return `"${s.replace(/\"/g, '""')}"`;
      return s;
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportCsvAll = () => {
    const stamp = `${fromDay}_to_${toDay}`;
    downloadCsv(`analytics_revenue_${stamp}.csv`, revenueDaily);
    downloadCsv(`analytics_users_${stamp}.csv`, usersDaily);
    downloadCsv(`analytics_workouts_${stamp}.csv`, workoutsDaily);
    downloadCsv(`analytics_top_users_${stamp}.csv`, topUsers);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    const title = lang === "ar" ? "تقارير Royal Fitness" : "Royal Fitness Analytics";
    const subtitle = `${fromDay} → ${toDay}`;
    doc.setFontSize(14);
    doc.text(title, 40, 40);
    doc.setFontSize(11);
    doc.text(subtitle, 40, 60);

    const summaryRows = [
      [t("إيراد الفترة", "Revenue"), `${nf.format(revenueTotal)} ${currency}`],
      [t("موافقات", "Approvals"), String(approvedTotal)],
      [t("مستخدمون جدد", "New users"), String(newUsersTotal)],
      [t("إجمالي الدقائق", "Total minutes"), String(workoutsTotals.minutes)],
      [t("إجمالي الجلسات", "Total sessions"), String(workoutsTotals.sessions)],
      [t("تحديات نشطة", "Active challenges"), String(challengesSummary?.active_count ?? 0)],
      [t("خطط نشطة", "Active plans"), String(plansSummary?.active_assignments ?? 0)],
      [t("إشعارات الأدمن", "Admin notifications"), String(notifSummary?.admin_notifications ?? 0)],
    ];

    autoTable(doc, {
      startY: 80,
      head: [[t("البند", "Metric"), t("القيمة", "Value")]],
      body: summaryRows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [1, 49, 31] },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 14,
      head: [[t("اليوم", "Day"), t("موافقات", "Approvals"), t("الإيراد", "Revenue")]],
      body: revenueDaily.map((r) => [
        r.day,
        String(r.approved_count ?? 0),
        `${nf.format(((Number(r.revenue_cents) || 0) / 100))} ${currency}`,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [1, 49, 31] },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 14,
      head: [[t("الاسم", "Name"), t("الإيميل", "Email"), t("الدقائق", "Minutes"), t("الجلسات", "Sessions")]],
      body: topUsers.map((u) => [
        u.name,
        u.email,
        String(u.total_minutes ?? 0),
        String(u.total_sessions ?? 0),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [1, 49, 31] },
    });

    doc.save(`analytics_${fromDay}_to_${toDay}.pdf`);
  };

  useEffect(() => {
    if (!ready) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const currency = useMemo(() => {
    const row = revenueDaily.find((r) => r.currency)?.currency;
    return (row || "EGP").toUpperCase();
  }, [revenueDaily]);

  const revenueTotal = useMemo(() => {
    const cents = revenueDaily.reduce((acc, r) => acc + (Number(r.revenue_cents) || 0), 0);
    return cents / 100;
  }, [revenueDaily]);

  const approvedTotal = useMemo(
    () => revenueDaily.reduce((acc, r) => acc + (Number(r.approved_count) || 0), 0),
    [revenueDaily],
  );

  const newUsersTotal = useMemo(
    () => usersDaily.reduce((acc, r) => acc + (Number(r.new_users) || 0), 0),
    [usersDaily],
  );

  const workoutsTotals = useMemo(() => {
    return workoutsDaily.reduce(
      (acc, r) => ({
        minutes: acc.minutes + (Number(r.total_minutes) || 0),
        calories: acc.calories + (Number(r.total_calories) || 0),
        steps: acc.steps + (Number(r.total_steps) || 0),
        sessions: acc.sessions + (Number(r.total_sessions) || 0),
      }),
      { minutes: 0, calories: 0, steps: 0, sessions: 0 },
    );
  }, [workoutsDaily]);

  const nf = useMemo(
    () =>
      new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
        maximumFractionDigits: 2,
      }),
    [lang],
  );

  if (forbidden) {
    return (
      <div className="p-6">
        <h2 className="text-[#F5EAD4]">{t("غير مسموح", "Forbidden")}</h2>
        <p className="text-muted-foreground" style={{ fontSize: 14 }}>
          {t("التقارير متاحة للأدمن فقط.", "Analytics is available to admins only.")}
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl text-[#F5EAD4] sm:text-2xl">{t("التقارير", "Analytics")}</h1>
            <p className="text-muted-foreground text-sm sm:text-[14px]">
              {t("تقارير مرتبطة بكل بيانات النظام (آخر 30 يوم افتراضيًا).", "System-wide reports (default last 30 days).")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => exportCsvAll()} disabled={loading}>
              {t("تصدير CSV", "Export CSV")}
            </Button>
            <Button type="button" className="bg-[#D4AF37] text-[#0B1B14] hover:brightness-110" onClick={() => exportPdf()} disabled={loading}>
              {t("تصدير PDF", "Export PDF")}
            </Button>
          </div>
        </div>
        {error ? (
          <div className="mt-3 text-red-400" style={{ fontSize: 13 }}>
            {error}
          </div>
        ) : null}
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-0">
          <CardTitle className="text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 700 }}>
            {t("فلترة التاريخ", "Date range")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap gap-2">
              {([
                ["7", t("آخر 7 أيام", "Last 7 days")],
                ["30", t("آخر 30 يوم", "Last 30 days")],
                ["90", t("آخر 90 يوم", "Last 90 days")],
                ["custom", t("مخصص", "Custom")],
              ] as const).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  variant={preset === key ? "default" : "secondary"}
                  onClick={() => applyPreset(key)}
                  className={preset === key ? "bg-[#D4AF37] text-[#0B1B14] hover:brightness-110" : ""}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                  {t("من", "From")}
                </span>
                <input
                  type="date"
                  value={fromDay}
                  onChange={(e) => {
                    setPreset("custom");
                    setFromDay(e.target.value);
                  }}
                  className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-[#F5EAD4]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                  {t("إلى", "To")}
                </span>
                <input
                  type="date"
                  value={toDay}
                  onChange={(e) => {
                    setPreset("custom");
                    setToDay(e.target.value);
                  }}
                  className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-[#F5EAD4]"
                />
              </label>
              <Button
                type="button"
                onClick={() => loadAll()}
                disabled={loading}
                className="bg-emerald-500 text-[#0B1B14] hover:brightness-110"
              >
                {loading ? t("جارٍ التحميل…", "Loading…") : t("تطبيق", "Apply")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="subscriptions">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="subscriptions">{t("الاشتراكات", "Subscriptions")}</TabsTrigger>
          <TabsTrigger value="users">{t("المستخدمين", "Users")}</TabsTrigger>
          <TabsTrigger value="workouts">{t("النشاط", "Engagement")}</TabsTrigger>
          <TabsTrigger value="challenges">{t("التحديات/الخطط", "Challenges & Plans")}</TabsTrigger>
          <TabsTrigger value="notifications">{t("الإشعارات", "Notifications")}</TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30"
              onClick={() => navigate("/subscriptions")}
            >
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("إيراد الفترة", "Revenue (range)")}
              </p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>
                {nf.format(revenueTotal)} {currency}
              </p>
            </button>
            <button
              type="button"
              className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30"
              onClick={() => navigate("/subscriptions")}
            >
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("طلبات موافق عليها", "Approved requests")}
              </p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>
                {approvedTotal.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
              </p>
            </button>
            <button
              type="button"
              className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30"
              onClick={() => navigate("/subscriptions")}
            >
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("متوسط قيمة الطلب", "Avg ticket")}
              </p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>
                {nf.format(approvedTotal ? revenueTotal / approvedTotal : 0)} {currency}
              </p>
            </button>
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 700 }}>
                {t("الإيراد اليومي", "Daily revenue")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={revenueDaily.map((r) => ({
                      day: r.day,
                      revenue: (Number(r.revenue_cents) || 0) / 100,
                      approved: Number(r.approved_count) || 0,
                    }))}
                  >
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
                    <XAxis dataKey="day" tick={{ fill: "#a8997e", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#a8997e", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#01311f",
                        border: "1px solid rgba(212,175,55,0.2)",
                        borderRadius: 8,
                        color: "#F5EAD4",
                        fontSize: 13,
                      }}
                      formatter={(value: any, name: any) => {
                        if (name === "revenue") return [`${nf.format(Number(value) || 0)} ${currency}`, t("إيراد", "Revenue")];
                        return [String(value), t("موافقات", "Approvals")];
                      }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={2} fill="url(#revGrad)" name="revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30"
              onClick={() => navigate("/users")}
            >
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("مستخدمون جدد", "New users")}
              </p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>
                {newUsersTotal.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
              </p>
            </button>
            <button
              type="button"
              className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30"
              onClick={() => navigate("/users")}
            >
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("محذوفون", "Deleted")}
              </p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>
                {usersDaily.reduce((acc, r) => acc + (Number(r.deleted_users) || 0), 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
              </p>
            </button>
            <button
              type="button"
              className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30"
              onClick={() => navigate("/users")}
            >
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("أقصى نشاط يومي", "Peak daily actives")}
              </p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>
                {Math.max(0, ...usersDaily.map((r) => Number(r.active_users) || 0)).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
              </p>
            </button>
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 700 }}>
                {t("نمو المستخدمين", "User growth")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={usersDaily}>
                    <defs>
                      <linearGradient id="usersGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2ecc71" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#2ecc71" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
                    <XAxis dataKey="day" tick={{ fill: "#a8997e", fontSize: 11 }} axisLine={false} tickLine={false} />
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
                    <Area type="monotone" dataKey="new_users" stroke="#2ecc71" strokeWidth={2} fill="url(#usersGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workouts" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("الدقائق", "Minutes")}</p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 22, fontWeight: 700 }}>{workoutsTotals.minutes.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("السعرات", "Calories")}</p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 22, fontWeight: 700 }}>{workoutsTotals.calories.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("الخطوات", "Steps")}</p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 22, fontWeight: 700 }}>{workoutsTotals.steps.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("الجلسات", "Sessions")}</p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 22, fontWeight: 700 }}>{workoutsTotals.sessions.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
            </div>
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 700 }}>
                {t("نشاط المنصة (يومي)", "Platform engagement (daily)")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={workoutsDaily}>
                    <defs>
                      <linearGradient id="minGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
                    <XAxis dataKey="day" tick={{ fill: "#a8997e", fontSize: 11 }} axisLine={false} tickLine={false} />
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
                    <Area type="monotone" dataKey="total_minutes" stroke="#D4AF37" strokeWidth={2} fill="url(#minGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 700 }}>
                {t("Top Users (حسب الدقائق)", "Top users (by minutes)")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("الاسم", "Name")}</TableHead>
                    <TableHead>{t("الإيميل", "Email")}</TableHead>
                    <TableHead>{t("الدقائق", "Minutes")}</TableHead>
                    <TableHead>{t("الجلسات", "Sessions")}</TableHead>
                    <TableHead>{t("الخطوات", "Steps")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topUsers.map((u) => (
                    <TableRow key={u.user_id} className="cursor-pointer" onClick={() => navigate(`/users/${u.user_id}`)}>
                      <TableCell className="text-[#F5EAD4]">{u.name}</TableCell>
                      <TableCell className="text-muted-foreground" dir="ltr">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground">{(Number(u.total_minutes) || 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</TableCell>
                      <TableCell className="text-muted-foreground">{(Number(u.total_sessions) || 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</TableCell>
                      <TableCell className="text-muted-foreground">{(Number(u.total_steps) || 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="challenges" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button type="button" className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30" onClick={() => navigate("/challenges")}>
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("تحديات نشطة", "Active challenges")}</p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>{(challengesSummary?.active_count ?? 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
            </button>
            <button type="button" className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30" onClick={() => navigate("/challenges")}>
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("مكتملة", "Completed")}</p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>{(challengesSummary?.completed_count ?? 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
            </button>
            <button type="button" className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30" onClick={() => navigate("/challenges")}>
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("متوسط التقدم", "Avg progress")}</p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>{nf.format(challengesSummary?.avg_progress_percent ?? 0)}%</p>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button type="button" className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30" onClick={() => navigate("/plans")}>
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("خطط نشطة", "Active plans")}</p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>{(plansSummary?.active_assignments ?? 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
            </button>
            <button type="button" className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30" onClick={() => navigate("/plans")}>
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("منتهية/غير نشطة", "Ended/inactive")}</p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>{(plansSummary?.ended_assignments ?? 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
            </button>
            <button type="button" className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30" onClick={() => navigate("/plans")}>
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("إجمالي الإسنادات", "Total assignments")}</p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>{(plansSummary?.total_assignments ?? 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
            </button>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button type="button" className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30" onClick={() => navigate("/notifications")}>
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("إشعارات المستخدم", "User notifications")}</p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>{(notifSummary?.user_notifications ?? 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
            </button>
            <button type="button" className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30" onClick={() => navigate("/notifications")}>
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("رسائل", "Messages")}</p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>{(notifSummary?.user_messages ?? 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
            </button>
            <button type="button" className="rounded-xl border border-border bg-card p-4 text-start hover:border-[#D4AF37]/30" onClick={() => navigate("/notifications")}>
              <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("إشعارات الأدمن", "Admin notifications")}</p>
              <p className="mt-1 text-[#F5EAD4]" style={{ fontSize: 26, fontWeight: 700 }}>{(notifSummary?.admin_notifications ?? 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
            </button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

