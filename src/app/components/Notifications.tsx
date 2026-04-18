import { useEffect, useMemo, useState } from "react";
import { useLang } from "./LanguageContext";
import { db, ensureAdminAuth, hasFirebaseConfig } from "../firebase";

type NotificationItem = {
  id: string | number;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export function Notifications() {
  const { lang, t } = useLang();
  const fallbackNotifications: NotificationItem[] = useMemo(
    () => [
      {
        id: 1,
        title: t("تسجيل مستخدم جديد", "New user signup"),
        body: t("أحمد حسن أنشأ حسابًا جديدًا.", "Ahmed Hassan created an account."),
        read: false,
        createdAt: "2026-04-15T08:00:00.000Z",
      },
      {
        id: 2,
        title: t("تجديد اشتراك", "Subscription renewal"),
        body: t("3 مستخدمين جددوا خطة بريميوم اليوم.", "3 users renewed Pro plan today."),
        read: true,
        createdAt: "2026-04-14T10:00:00.000Z",
      },
    ],
    [t],
  );
  const [items, setItems] = useState<NotificationItem[]>(fallbackNotifications);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [live, setLive] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !hasFirebaseConfig) return;
    let channel: ReturnType<typeof db.channel> | null = null;
    let cancelled = false;

    const loadNotifications = async () => {
      const resp = await db.from("admin_notifications").select("*").order("created_at", { ascending: false });
      const rows = resp.data ?? [];
      const mapped = rows.map((data) => ({
        id: data.id,
        title: data.title?.toString() ?? t("إشعار", "Notification"),
        body: data.body?.toString() ?? "",
        read: Boolean(data.read),
        createdAt: data.created_at?.toString() ?? new Date().toISOString(),
      }));
      setItems(mapped.length ? mapped : fallbackNotifications);
      setLive(mapped.length > 0);
    };

    ensureAdminAuth().then((authed) => {
      if (!authed || cancelled) {
        setAuthError("Admin auth failed. Check VITE_ADMIN_EMAIL / VITE_ADMIN_PASSWORD in Vercel env.");
        setLive(false);
        return;
      }
      setAuthError(null);
      loadNotifications();
      channel = db
        .channel("admin-notifications-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, () => loadNotifications())
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) db.removeChannel(channel);
    };
  }, [fallbackNotifications, t]);

  useEffect(() => {
    if (!live) {
      setItems(fallbackNotifications);
    }
  }, [fallbackNotifications, live]);

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const publishNotification = async () => {
    if (!title.trim() || !body.trim()) return;
    const payload: NotificationItem = {
      id: `local-${Date.now()}`,
      title: title.trim(),
      body: body.trim(),
      read: false,
      createdAt: new Date().toISOString(),
    };

    if (!live || !db || !hasFirebaseConfig) {
      setItems((prev) => [payload, ...prev]);
      setTitle("");
      setBody("");
      return;
    }

    await ensureAdminAuth();
    await db.from("admin_notifications").insert({
      title: title.trim(),
      body: body.trim(),
      read: false,
      type: "manual",
    });
    setTitle("");
    setBody("");
  };

  const markRead = async (item: NotificationItem) => {
    if (!live || !db || !hasFirebaseConfig || typeof item.id !== "string") {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      return;
    }
    await ensureAdminAuth();
    await db.from("admin_notifications").update({ read: true }).eq("id", item.id);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-[#F5EAD4]">{t("الإشعارات", "Notifications")}</h1>
        <p className="text-muted-foreground" style={{ fontSize: 14 }}>
          {t("إدارة إشعارات النظام وإرسال تنبيهات", "Manage system notifications and announcements")}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
        <div>
          <p className="text-muted-foreground" style={{ fontSize: 12 }}>{t("غير المقروءة", "Unread")}</p>
          <p className="text-[#D4AF37]" style={{ fontSize: 24, fontWeight: 600 }}>{unreadCount}</p>
        </div>
        <span className={live ? "text-emerald-400" : "text-amber-400"} style={{ fontSize: 12 }}>
          {live ? t("متصل بقاعدة البيانات", "Connected to database") : t("وضع محلي", "Local mode")}
        </span>
      </div>
      {authError ? (
        <div className="text-red-400" style={{ fontSize: 13 }}>
          {authError}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 600 }}>{t("إرسال إشعار جديد", "Send notification")}</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("عنوان الإشعار", "Notification title")}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("محتوى الإشعار", "Notification body")}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border min-h-20"
        />
        <button onClick={publishNotification} className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#012217] hover:bg-[#c9a430]">
          {t("إرسال", "Publish")}
        </button>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</p>
                <p className="text-muted-foreground" style={{ fontSize: 12 }}>
                  {new Date(item.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                </p>
              </div>
              {!item.read ? (
                <button onClick={() => markRead(item)} className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-[#D4AF37]">
                  {t("تحديد كمقروء", "Mark as read")}
                </button>
              ) : (
                <span className="text-emerald-400" style={{ fontSize: 12 }}>{t("مقروء", "Read")}</span>
              )}
            </div>
            <p className="text-muted-foreground mt-2" style={{ fontSize: 13 }}>{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
