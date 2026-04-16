import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { useLang } from "./LanguageContext";
import { db, hasFirebaseConfig } from "../firebase";

type Ticket = {
  id: string | number;
  user: string;
  subject: string;
  status: "open" | "resolved";
  message: string;
};

export function Support() {
  const { t } = useLang();
  const fallbackTickets: Ticket[] = useMemo(
    () => [
      {
        id: 1,
        user: t("أحمد حسن", "Ahmed Hassan"),
        subject: t("مشكلة دفع", "Payment issue"),
        status: "open",
        message: t("تم خصم الاشتراك مرتين.", "My renewal was charged twice."),
      },
      {
        id: 2,
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
  const [pendingId, setPendingId] = useState<string | number | null>(null);

  useEffect(() => {
    if (!db || !hasFirebaseConfig) return;
    const unsub = onSnapshot(query(collection(db, "support_tickets"), orderBy("createdAt", "desc")), (snapshot) => {
      const mapped = snapshot.docs.map((item) => {
        const data = item.data() as Partial<Ticket>;
        return {
          id: item.id,
          user: data.user ?? t("مستخدم التطبيق", "App User"),
          subject: data.subject ?? t("مشكلة عامة", "General issue"),
          status: data.status === "resolved" ? "resolved" : "open",
          message: data.message ?? "",
        } satisfies Ticket;
      });
      setTickets(mapped.length ? mapped : fallbackTickets);
      setLive(mapped.length > 0);
    });
    return () => unsub();
  }, [fallbackTickets]);

  useEffect(() => {
    if (!live) {
      setTickets(fallbackTickets);
    }
  }, [fallbackTickets, live]);

  const createTicket = async () => {
    if (!subject.trim() || !message.trim()) return;
    const next: Ticket = {
      id: `local-${Date.now()}`,
      user: t("مدير النظام", "Admin"),
      subject: subject.trim(),
      status: "open",
      message: message.trim(),
    };

    if (!live || !db || !hasFirebaseConfig) {
      setTickets((prev) => [next, ...prev]);
      setSubject("");
      setMessage("");
      return;
    }

    await addDoc(collection(db, "support_tickets"), {
      user: t("مدير النظام", "Admin"),
      subject: subject.trim(),
      message: message.trim(),
      status: "open",
      createdAt: serverTimestamp(),
    });
    setSubject("");
    setMessage("");
  };

  const resolveTicket = async (ticket: Ticket) => {
    const nextStatus: Ticket["status"] = ticket.status === "open" ? "resolved" : "open";
    if (!live || !db || !hasFirebaseConfig || typeof ticket.id !== "string") {
      setTickets((prev) => prev.map((item) => (item.id === ticket.id ? { ...item, status: nextStatus } : item)));
      return;
    }
    try {
      setPendingId(ticket.id);
      await updateDoc(doc(db, "support_tickets", ticket.id), { status: nextStatus, updatedAt: serverTimestamp() });
    } finally {
      setPendingId(null);
    }
  };

  const statusLabel = (status: Ticket["status"]) =>
    status === "open" ? t("مفتوحة", "Open") : t("محلولة", "Resolved");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-[#F5EAD4]">{t("الدعم الفني", "Support")}</h1>
        <p className="text-muted-foreground" style={{ fontSize: 14 }}>
          {t("إدارة تذاكر المستخدمين والتواصل", "Handle user tickets and support workflows")}
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

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full">
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
                <td className="px-4 py-3 text-muted-foreground">{ticket.message}</td>
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
  );
}
