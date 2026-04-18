import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLang } from "./LanguageContext";
import { db, ensureStaffAuth, hasFirebaseConfig } from "../firebase";

type Point = { name: string; users: number; workouts: number };

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function buildLast6MonthLabels(lang: string, t: (a: string, b: string) => string): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    out.push({
      key: monthKey(d),
      label: d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { month: "short" }),
    });
  }
  return out;
}

export function Analytics() {
  const { lang, t } = useLang();
  const fallbackData = useMemo<Point[]>(
    () => [
      { name: t("يناير", "Jan"), users: 120, workouts: 430 },
      { name: t("فبراير", "Feb"), users: 210, workouts: 610 },
      { name: t("مارس", "Mar"), users: 260, workouts: 720 },
      { name: t("أبريل", "Apr"), users: 310, workouts: 870 },
      { name: t("مايو", "May"), users: 370, workouts: 1030 },
      { name: t("يونيو", "Jun"), users: 460, workouts: 1240 },
    ],
    [t],
  );
  const [data, setData] = useState<Point[]>(fallbackData);
  const [usersCount, setUsersCount] = useState(0);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    if (!db || !hasFirebaseConfig) {
      setData(fallbackData);
      setLive(false);
      return;
    }
    const authed = await ensureStaffAuth();
    if (!authed) {
      setData(fallbackData);
      setLive(false);
      return;
    }

    const months = buildLast6MonthLabels(lang, t);
    const userBuckets = new Map<string, number>();
    const workoutBuckets = new Map<string, number>();
    months.forEach((m) => {
      userBuckets.set(m.key, 0);
      workoutBuckets.set(m.key, 0);
    });

    const profResp = await db.from("profiles").select("created_at");
    if (profResp.error) {
      console.error("[Analytics] profiles", profResp.error);
      setLive(false);
      setData(fallbackData);
      return;
    }
    const rows = (profResp.data ?? []) as { created_at?: string }[];
    setUsersCount(rows.length);
    rows.forEach((r) => {
      const raw = r.created_at;
      if (!raw) return;
      const d = new Date(raw);
      const key = monthKey(d);
      if (userBuckets.has(key)) userBuckets.set(key, (userBuckets.get(key) ?? 0) + 1);
    });

    const exResp = await db.from("exercises").select("id", { count: "exact", head: true });
    if (!exResp.error) setExerciseCount(exResp.count ?? 0);

    const wsResp = await db.from("workout_sessions").select("started_at");
    if (!wsResp.error) {
      const wsRows = (wsResp.data ?? []) as { started_at?: string }[];
      wsRows.forEach((r) => {
        const raw = r.started_at;
        if (!raw) return;
        const d = new Date(raw);
        const key = monthKey(d);
        if (workoutBuckets.has(key)) workoutBuckets.set(key, (workoutBuckets.get(key) ?? 0) + 1);
      });
    }

    const next: Point[] = months.map((m) => ({
      name: m.label,
      users: userBuckets.get(m.key) ?? 0,
      workouts: workoutBuckets.get(m.key) ?? 0,
    }));
    setData(next);
    setLive(true);
  }, [fallbackData, hasFirebaseConfig, lang, t]);

  useEffect(() => {
    let channel: ReturnType<typeof db.channel> | null = null;
    let cancelled = false;

    if (!db || !hasFirebaseConfig) return;

    ensureStaffAuth().then((ok) => {
      if (!ok || cancelled) return;
      load();
      channel = db
        .channel("analytics-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles" },
          () => load(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "workout_sessions" },
          () => load(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel && db) db.removeChannel(channel);
    };
  }, [load]);

  const totalWorkouts = useMemo(() => data.reduce((sum, p) => sum + p.workouts, 0), [data]);

  return (
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="min-w-0">
        <h1 className="text-xl text-[#F5EAD4] sm:text-2xl">{t("الإحصائيات", "Analytics")}</h1>
        <p className="text-muted-foreground text-sm sm:text-[14px]">
          {t("مؤشرات أداء التطبيق والاستخدام", "Usage and product performance metrics")} ·{" "}
          <span className={live ? "text-emerald-400" : "text-amber-400"}>
            {live ? t("بيانات حية", "Live data") : t("بيانات تقديرية", "Estimated data")}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("المستخدمون", "Users")}</p>
          <p className="text-[#F5EAD4]" style={{ fontSize: 24, fontWeight: 600 }}>{live ? usersCount : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("التمارين", "Exercises")}</p>
          <p className="text-[#D4AF37]" style={{ fontSize: 24, fontWeight: 600 }}>{live ? exerciseCount : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("جلسات تدريب (٦ أشهر)", "Workout sessions (6 mo)")}</p>
          <p className="text-emerald-400" style={{ fontSize: 24, fontWeight: 600 }}>{totalWorkouts}</p>
        </div>
      </div>

      <div className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5" dir="ltr">
        <div className="h-[240px] w-full sm:h-[280px] md:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
            <XAxis dataKey="name" tick={{ fill: "#a8997e", fontSize: 11 }} axisLine={false} tickLine={false} />
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
            <Bar dataKey="users" name={t("المستخدمون الجدد", "New users")} fill="#D4AF37" radius={[6, 6, 0, 0]} />
            <Bar dataKey="workouts" name={t("جلسات", "Sessions")} fill="#2ecc71" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
