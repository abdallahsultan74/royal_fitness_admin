import { useCallback, useEffect, useState, type ReactNode } from "react";
import { X, Activity, Dumbbell, Scale } from "lucide-react";
import { useLang } from "./LanguageContext";
import { db, ensureStaffAuth, hasFirebaseConfig } from "../firebase";

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
type SessionItemRow = {
  id: number;
  session_id: string;
  exercise_name: string | null;
  exercise_name_ar: string | null;
  done: boolean;
  duration_sec: number;
  calories: number;
};

type Props = {
  open: boolean;
  userId: string | null;
  userName: string;
  onClose: () => void;
};

export function UserActivityDrawer({ open, userId, userName, onClose }: Props) {
  const { t, isRTL } = useLang();
  const [tab, setTab] = useState<"weight" | "daily" | "workouts">("weight");
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionItems, setSessionItems] = useState<Record<string, SessionItemRow[]>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!db || !hasFirebaseConfig || !userId) return;
    setLoading(true);
    try {
      await ensureStaffAuth();
      const [wRes, dRes, sRes] = await Promise.all([
        db.from("weight_logs").select("*").eq("user_id", userId).order("logged_at", { ascending: false }).limit(90),
        db.from("daily_stats").select("*").eq("user_id", userId).order("date_key", { ascending: false }).limit(90),
        db
          .from("workout_sessions")
          .select("*")
          .eq("user_id", userId)
          .eq("completed", true)
          .order("started_at", { ascending: false })
          .limit(40),
      ]);
      const w = (wRes.data ?? []) as WeightRow[];
      const d = (dRes.data ?? []) as DailyRow[];
      const s = (sRes.data ?? []) as SessionRow[];
      setWeights(w);
      setDaily(d);
      setSessions(s);
      const ids = s.map((x) => x.id).filter(Boolean);
      if (ids.length === 0) {
        setSessionItems({});
        return;
      }
      const itemsRes = await db.from("workout_session_items").select("*").in("session_id", ids);
      const raw = (itemsRes.data ?? []) as SessionItemRow[];
      const bySession: Record<string, SessionItemRow[]> = {};
      raw.forEach((it) => {
        const sid = String(it.session_id);
        if (!bySession[sid]) bySession[sid] = [];
        bySession[sid].push(it);
      });
      setSessionItems(bySession);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!open || !userId) return;
    load();
  }, [open, userId, load]);

  if (!open || !userId) return null;

  const tabBtn = (key: typeof tab, icon: ReactNode, ar: string, en: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs sm:text-[13px] ${
        tab === key ? "bg-[#D4AF37]/15 text-[#D4AF37]" : "text-muted-foreground hover:bg-secondary/80"
      }`}
    >
      {icon}
      {t(ar, en)}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div
        className={`relative z-10 flex max-h-[min(92vh,720px)] w-full max-w-2xl flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl ${
          isRTL ? "text-right" : "text-left"
        }`}
      >
        <div className="flex items-start justify-between gap-2 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="text-lg text-[#F5EAD4] sm:text-xl">{t("نشاط المستخدم", "User activity")}</h2>
            <p className="truncate text-muted-foreground" style={{ fontSize: 13 }}>
              {userName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-[#F5EAD4]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-border px-2 py-2">
          {tabBtn("weight", <Scale className="h-4 w-4 shrink-0" />, "سجل الوزن", "Weight")}
          {tabBtn("daily", <Activity className="h-4 w-4 shrink-0" />, "يومي", "Daily")}
          {tabBtn("workouts", <Dumbbell className="h-4 w-4 shrink-0" />, "التمارين", "Workouts")}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-center text-muted-foreground" style={{ fontSize: 14 }}>
              {t("جاري التحميل…", "Loading…")}
            </p>
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
                  <div
                    key={row.date_key}
                    className="rounded-lg border border-border/60 bg-secondary/40 px-3 py-2"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="text-[#F5EAD4]" style={{ fontSize: 13 }}>
                        {row.date_key}
                      </span>
                      <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                        {row.session_count} {t("جلسات", "sessions")} · {row.completed_exercises}{" "}
                        {t("تمارين", "ex")}
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
            <div className="space-y-4">
              {sessions.length === 0 ? (
                <p className="text-muted-foreground" style={{ fontSize: 13 }}>
                  {t("لا توجد جلسات مكتملة.", "No completed sessions.")}
                </p>
              ) : (
                sessions.map((sess) => {
                  const items = sessionItems[sess.id] ?? [];
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
                      {items.length > 0 ? (
                        <ul className="mt-2 space-y-1 border-t border-border/40 pt-2">
                          {items.map((it) => (
                            <li key={it.id} className="flex justify-between gap-2 text-[13px]">
                              <span className="text-[#F5EAD4]">
                                {isRTL ? it.exercise_name_ar || it.exercise_name : it.exercise_name || it.exercise_name_ar}
                              </span>
                              <span className={`text-xs ${it.done ? "text-emerald-400" : "text-muted-foreground"}`}>
                                {it.done ? t("تم", "Done") : "—"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
