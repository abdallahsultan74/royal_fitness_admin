import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, updateDoc, doc } from "firebase/firestore";
import { useLang } from "./LanguageContext";
import { db, hasFirebaseConfig } from "../firebase";

type Subscription = {
  id: string | number;
  userName: string;
  userEmail: string;
  plan: string;
  status: string;
  amount: number;
  renewDate: string;
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

  useEffect(() => {
    if (!db || !hasFirebaseConfig) {
      setSubscriptions(localizedFallback);
      setLive(false);
      return;
    }

    const unsub = onSnapshot(query(collection(db, "subscriptions")), (snapshot) => {
      const mapped = snapshot.docs.map((item) => {
        const data = item.data() as Partial<Subscription>;
        return {
          id: item.id,
          userName: data.userName ?? t("مستخدم", "User"),
          userEmail: data.userEmail ?? "unknown@email.com",
          plan: data.plan ?? "Basic",
          status: data.status ?? "active",
          amount: Number(data.amount ?? 0),
          renewDate: data.renewDate ?? new Date().toISOString().slice(0, 10),
        };
      });
      setSubscriptions(mapped.length ? mapped : localizedFallback);
      setLive(mapped.length > 0);
    });

    return () => unsub();
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
    if (normalized === "active") return t("نشط", "Active");
    if (normalized === "cancelled") return t("ملغي", "Cancelled");
    if (normalized === "trial") return t("تجريبي", "Trial");
    return status;
  };

  const toggleStatus = async (item: Subscription) => {
    const next = item.status === "active" ? "cancelled" : "active";
    if (!live || !db || !hasFirebaseConfig || typeof item.id !== "string") {
      setSubscriptions((prev) => prev.map((s) => (s.id === item.id ? { ...s, status: next } : s)));
      return;
    }
    try {
      setPendingId(item.id);
      await updateDoc(doc(db, "subscriptions", item.id), { status: next });
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("إجمالي الاشتراكات", "Total subscriptions")}</p>
          <p className="text-[#F5EAD4]" style={{ fontSize: 24, fontWeight: 600 }}>{subscriptions.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("الاشتراكات النشطة", "Active subscriptions")}</p>
          <p className="text-emerald-400" style={{ fontSize: 24, fontWeight: 600 }}>{subscriptions.filter((s) => s.status === "active").length}</p>
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
                  <span className={`px-2 py-0.5 rounded-full ${s.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`} style={{ fontSize: 11 }}>
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
                    {s.status === "active" ? t("إلغاء", "Cancel") : t("تفعيل", "Activate")}
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
