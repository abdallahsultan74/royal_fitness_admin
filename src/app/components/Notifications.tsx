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

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  role: string;
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
  const [sendMode, setSendMode] = useState<"system" | "user">("system");
  const [recipients, setRecipients] = useState<ProfileRow[]>([]);
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<"all" | "user" | "coach" | "admin">("all");

  useEffect(() => {
    if (!db || !hasFirebaseConfig) return;
    let channel: ReturnType<typeof db.channel> | null = null;
    let cancelled = false;

    const loadRecipients = async () => {
      const resp = await db
        .from("profiles")
        .select("id,name,email,role")
        .order("name", { ascending: true })
        .limit(300);
      const rows = (resp.data ?? []) as ProfileRow[];
      setRecipients(rows);
    };

    const loadNotifications = async () => {
      const resp = await db.from("admin_notifications").select("*").order("created_at", { ascending: false });
      const rows = resp.data ?? [];
      const mapped = rows.map((data: Record<string, unknown>) => ({
        id: data.id as string,
        title: data.title?.toString() ?? t("إشعار", "Notification"),
        body: data.body?.toString() ?? "",
        read: Boolean(data.read),
        createdAt: data.created_at?.toString() ?? new Date().toISOString(),
      }));
      setItems(mapped);
      setLive(true);
    };

    ensureAdminAuth().then((authed) => {
      if (!authed || cancelled) {
        setAuthError(
          t(
            "فشل دخول الأدمن. إمّا سجّل دخولك بحساب أدمن، أو اضبط VITE_ADMIN_EMAIL و VITE_ADMIN_PASSWORD في Vercel.",
            "Admin sign-in failed. Log in as an admin account, or set VITE_ADMIN_EMAIL / VITE_ADMIN_PASSWORD in Vercel.",
          ),
        );
        setLive(false);
        return;
      }
      setAuthError(null);
      loadNotifications();
      loadRecipients();
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

  const filteredRecipients = useMemo(() => {
    if (roleFilter === "all") return recipients;
    return recipients.filter((r) => (r.role ?? "user").toLowerCase() === roleFilter);
  }, [recipients, roleFilter]);

  const roleLabel = (r: string) => {
    const x = (r ?? "user").toLowerCase();
    if (x === "admin") return t("أدمن", "Admin");
    if (x === "coach") return t("مدرب", "Coach");
    return t("مستخدم", "User");
  };

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

    if (sendMode === "user") {
      if (!targetUserId) return;
      const session = await db.auth.getSession();
      const senderId = session.data.session?.user?.id;
      if (!senderId) return;
      const { error } = await db.from("user_notifications").insert({
        user_id: targetUserId,
        sender_id: senderId,
        type: "notification",
        title: title.trim(),
        body: body.trim(),
      });
      if (error) {
        setAuthError(error.message);
        return;
      }
    } else {
      await db.from("admin_notifications").insert({
        title: title.trim(),
        body: body.trim(),
        read: false,
        type: "manual",
      });
    }
    setTitle("");
    setBody("");
    setAuthError(null);
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
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="min-w-0">
        <h1 className="text-xl text-[#F5EAD4] sm:text-2xl">{t("الإشعارات", "Notifications")}</h1>
        <p className="text-muted-foreground text-sm sm:text-[14px]">
          {t("إدارة إشعارات النظام وإرسال تنبيهات", "Manage system notifications and announcements")}
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-muted-foreground text-xs sm:text-[12px]">{t("غير المقروءة", "Unread")}</p>
          <p className="text-2xl font-semibold text-[#D4AF37] sm:text-3xl">{unreadCount}</p>
        </div>
        <span className={`text-xs sm:text-[12px] ${live ? "text-emerald-400" : "text-amber-400"}`}>
          {live ? t("متصل بقاعدة البيانات", "Connected to database") : t("وضع محلي", "Local mode")}
        </span>
      </div>
      {authError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-300" style={{ fontSize: 13 }}>
          {authError}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 600 }}>
          {t("إرسال إشعار جديد", "Send notification")}
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setSendMode("system")}
            className={`rounded-lg border px-3 py-2 text-start ${sendMode === "system" ? "border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#F5EAD4]" : "border-border bg-secondary text-muted-foreground"}`}
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            {t("صندوق إشعارات الأدمن (الكل)", "Admin inbox (system)")}
          </button>
          <button
            type="button"
            onClick={() => setSendMode("user")}
            className={`rounded-lg border px-3 py-2 text-start ${sendMode === "user" ? "border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#F5EAD4]" : "border-border bg-secondary text-muted-foreground"}`}
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            {t("مستخدم محدد (مدرب/عضو/أدمن)", "Specific user (coach/member/admin)")}
          </button>
        </div>

        {sendMode === "user" ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", t("الكل", "All")],
                  ["user", t("أعضاء", "Members")],
                  ["coach", t("مدربون", "Coaches")],
                  ["admin", t("أدمن", "Admins")],
                ] as const
              ).map(([v, lab]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRoleFilter(v)}
                  className={`rounded-full border px-3 py-1 ${roleFilter === v ? "border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#F5EAD4]" : "border-border text-muted-foreground"}`}
                  style={{ fontSize: 12 }}
                >
                  {lab}
                </button>
              ))}
            </div>
            <label className="text-muted-foreground" style={{ fontSize: 12 }}>
              {t("المستلم", "Recipient")}
            </label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-[#F5EAD4]"
              style={{ fontSize: 13 }}
            >
              <option value="">{t("اختر مستخدمًا…", "Choose a user…")}</option>
              {filteredRecipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {(r.name || r.email || r.id).toString()} · {roleLabel(r.role)} · {r.email ?? ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}

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
        <button
          onClick={publishNotification}
          disabled={sendMode === "user" && !targetUserId}
          className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#012217] hover:bg-[#c9a430] disabled:opacity-50"
        >
          {t("إرسال", "Publish")}
        </button>
      </div>

      <div className="space-y-3">
        {live && items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground" style={{ fontSize: 14 }}>
            {t("لا توجد إشعارات في صندوق الأدمن بعد.", "No admin inbox notifications yet.")}
          </div>
        ) : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[#F5EAD4]" style={{ fontSize: 14, fontWeight: 600 }}>
                  {item.title}
                </p>
                <p className="text-muted-foreground text-xs sm:text-[12px]">
                  {new Date(item.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                </p>
              </div>
              {!item.read ? (
                <button
                  type="button"
                  onClick={() => markRead(item)}
                  className="w-full shrink-0 rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:text-[#D4AF37] sm:w-auto"
                >
                  {t("تحديد كمقروء", "Mark as read")}
                </button>
              ) : (
                <span className="text-emerald-400 text-xs sm:text-[12px]">{t("مقروء", "Read")}</span>
              )}
            </div>
            <p className="mt-2 break-words text-muted-foreground text-sm sm:text-[13px]">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
