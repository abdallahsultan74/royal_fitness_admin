import { useEffect, useMemo, useState } from "react";
import { useLang } from "./LanguageContext";
import { db, ensureStaffAuth, hasFirebaseConfig } from "../firebase";

const STORAGE_KEY = "royal_support_tickets_v1";

type Ticket = {
  id: string;
  user: string;
  subject: string;
  status: "open" | "resolved";
  message: string;
  createdAt?: string;
};

function loadTickets(fallback: Ticket[]): Ticket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Ticket[];
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function persistTickets(rows: Ticket[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

export function Support() {
  const { t } = useLang();
  const fallbackTickets: Ticket[] = useMemo(
    () => [
      {
        id: "demo-1",
        user: t("أحمد حسن", "Ahmed Hassan"),
        subject: t("مشكلة دفع", "Payment issue"),
        status: "open",
        message: t("تم خصم الاشتراك مرتين.", "My renewal was charged twice."),
      },
      {
        id: "demo-2",
        user: t("سارة الراشد", "Sara Al-Rashid"),
        subject: t("مشكلة تسجيل الدخول", "Login issue"),
        status: "resolved",
        message: t("لا أستطيع الدخول من تطبيق أندرويد.", "Cannot log in on Android app."),
      },
    ],
    [t],
  );
  const [tickets, setTickets] = useState<Ticket[]>(fallbackTickets);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [live, setLive] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !hasFirebaseConfig) {
      setTickets(loadTickets(fallbackTickets));
      setLive(false);
      return;
    }
    let cancelled = false;
    ensureStaffAuth().then((ok) => {
      if (cancelled) return;
      if (ok) {
        setLive(true);
        const stored = loadTickets(fallbackTickets);
        setTickets(stored.length ? stored : fallbackTickets);
      } else {
        setLive(false);
        setTickets(fallbackTickets);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fallbackTickets]);

  useEffect(() => {
    if (live && tickets.length > 0) persistTickets(tickets);
  }, [tickets, live]);

  const createTicket = async () => {
    if (!subject.trim() || !message.trim()) return;
    const next: Ticket = {
      id: `t-${Date.now()}`,
      user: t("مدير النظام", "Admin"),
      subject: subject.trim(),
      status: "open",
      message: message.trim(),
      createdAt: new Date().toISOString(),
    };
    setTickets((prev) => [next, ...prev]);
    setSubject("");
    setMessage("");
  };

  const resolveTicket = async (ticket: Ticket) => {
    const nextStatus: Ticket["status"] = ticket.status === "open" ? "resolved" : "open";
    setPendingId(String(ticket.id));
    try {
      setTickets((prev) => prev.map((item) => (item.id === ticket.id ? { ...item, status: nextStatus } : item)));
    } finally {
      setPendingId(null);
    }
  };

  const statusLabel = (status: Ticket["status"]) =>
    status === "open" ? t("مفتوحة", "Open") : t("محلولة", "Resolved");

  return (
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="min-w-0">
        <h1 className="text-xl text-[#F5EAD4] sm:text-2xl">{t("الدعم الفني", "Support")}</h1>
        <p className="text-muted-foreground text-sm sm:text-[14px]">
          {t("إدارة تذاكر المستخدمين والتواصل", "Handle user tickets and support workflows")} ·{" "}
          <span className={live ? "text-emerald-400" : "text-amber-400"}>
            {live
              ? t("تذاكر داخلية (المتصفح)", "Internal tickets (browser)")
              : t("وضع تجريبي", "Demo")}
          </span>
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 600 }}>{t("إنشاء تذكرة داخلية", "Create internal ticket")}</p>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("عنوان المشكلة", "Issue subject")}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("وصف المشكلة", "Issue details")}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border min-h-24"
        />
        <button onClick={createTicket} className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#012217] hover:bg-[#c9a430]">
          {t("إرسال", "Submit")}
        </button>
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-border">
              {[t("المستخدم", "User"), t("العنوان", "Subject"), t("الحالة", "Status"), t("الوصف", "Message"), t("إجراء", "Action")].map((h) => (
                <th key={h} className="px-4 py-3 text-start text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="border-b border-border/50">
                <td className="px-4 py-3 text-[#F5EAD4]">{ticket.user}</td>
                <td className="px-4 py-3 text-muted-foreground">{ticket.subject}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full ${ticket.status === "open" ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                    {statusLabel(ticket.status)}
                  </span>
                </td>
                <td className="max-w-[200px] px-4 py-3 text-muted-foreground sm:max-w-xs">
                  <span className="line-clamp-3 break-words">{ticket.message}</span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => resolveTicket(ticket)}
                    disabled={pendingId === ticket.id}
                    className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-[#D4AF37] hover:border-[#D4AF37]/30 disabled:opacity-50"
                    style={{ fontSize: 12 }}
                  >
                    {ticket.status === "open" ? t("حل", "Resolve") : t("إعادة فتح", "Reopen")}
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
