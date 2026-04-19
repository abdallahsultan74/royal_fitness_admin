import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, UserMinus, Users } from "lucide-react";
import { useLang } from "./LanguageContext";
import { db, ensureStaffAuth, hasFirebaseConfig } from "../firebase";
import { PlanJsonEditor, normalizePlanJson, serializePlanJson, type PlanJsonDraft } from "./PlanJsonEditor";

type PlanRow = {
  id: string;
  created_by: string;
  title: string;
  description: string | null;
  level: string;
  duration_weeks: number;
  json_plan: any;
  created_at: string;
};

type ProfileLite = { id: string; name: string | null; email: string | null };

type PlanAssignmentRow = {
  id: string;
  plan_id: string;
  user_id: string;
  status: string;
  created_at: string;
  profile?: ProfileLite | null;
};

export function Plans() {
  const { t, isRTL } = useLang();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  // create/edit form
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [level, setLevel] = useState("beginner");
  const [weeks, setWeeks] = useState(4);
  const [jsonDraft, setJsonDraft] = useState<PlanJsonDraft>({ slots: [] });

  // assignment
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPlan, setAssignPlan] = useState<PlanRow | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState<ProfileLite[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<PlanAssignmentRow[]>([]);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  const resetForm = () => {
    setEditing(null);
    setTitle("");
    setDesc("");
    setLevel("beginner");
    setWeeks(4);
    setJsonDraft({ slots: [] });
  };

  const loadPlans = useCallback(async () => {
    if (!db || !hasFirebaseConfig) return;
    setLoading(true);
    setAuthError(null);
    try {
      const authed = await ensureStaffAuth();
      if (!authed) {
        setLive(false);
        setPlans([]);
        setAssignments([]);
        return;
      }
      const resp = await db.from("training_plans").select("*").order("created_at", { ascending: false });
      if (resp.error) {
        setAuthError(resp.error.message);
        setLive(false);
        setPlans([]);
        setAssignments([]);
        return;
      }
      setLive(true);
      const planRows = (resp.data ?? []) as PlanRow[];
      setPlans(planRows);
      if (planRows.length === 0) {
        setAssignments([]);
      } else {
        const ids = planRows.map((p) => p.id);
        const ar = await db
          .from("plan_assignments")
          .select("id, plan_id, user_id, status, created_at")
          .in("plan_id", ids)
          .order("created_at", { ascending: false });
        if (ar.error) {
          setAssignments([]);
        } else {
          const raw = (ar.data ?? []) as Omit<PlanAssignmentRow, "profile">[];
          const uids = [...new Set(raw.map((r) => r.user_id))];
          let profileById: Record<string, ProfileLite> = {};
          if (uids.length) {
            const pr = await db.from("profiles").select("id, name, email").in("id", uids);
            if (!pr.error && pr.data) {
              profileById = Object.fromEntries((pr.data as ProfileLite[]).map((p) => [p.id, p]));
            }
          }
          setAssignments(
            raw.map((r) => ({
              ...r,
              profile: profileById[r.user_id] ?? null,
            })),
          );
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    if (!db || !hasFirebaseConfig) return;
    try {
      await ensureStaffAuth();
      const resp = await db.from("profiles").select("id, name, email").order("created_at", { ascending: false }).limit(200);
      setUsers((resp.data ?? []) as any);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (!db || !hasFirebaseConfig) return;
    let channel: ReturnType<typeof db.channel> | null = null;
    let cancelled = false;
    ensureStaffAuth().then((ok) => {
      if (!ok || cancelled) return;
      channel = db
        .channel("training-plans-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "training_plans" },
          () => loadPlans(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "plan_assignments" },
          () => loadPlans(),
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) db.removeChannel(channel);
    };
  }, [loadPlans]);

  const openCreate = () => {
    resetForm();
    setJsonDraft({ slots: [] });
    setOpenForm(true);
  };

  const openEdit = (p: PlanRow) => {
    setEditing(p);
    setTitle(p.title ?? "");
    setDesc(p.description ?? "");
    setLevel(p.level ?? "beginner");
    setWeeks(Number(p.duration_weeks ?? 4));
    setJsonDraft(normalizePlanJson(p.json_plan));
    setOpenForm(true);
  };

  const savePlan = async () => {
    if (!db || !hasFirebaseConfig) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    setAuthError(null);
    try {
      const authed = await ensureStaffAuth();
      if (!authed) {
        setAuthError(t("فشل التحقق من صلاحيات الموظف.", "Staff auth failed."));
        return;
      }
      const session = await db.auth.getSession();
      const uid = session.data.session?.user?.id;
      if (!uid) {
        setAuthError(t("لا يوجد مستخدم في الجلسة.", "Missing session user."));
        return;
      }
      const payload: any = {
        ...(editing ? {} : { created_by: uid }),
        title: trimmed,
        description: desc.trim() || null,
        level,
        duration_weeks: Number.isFinite(weeks) ? weeks : 4,
        json_plan: serializePlanJson(jsonDraft),
      };
      const resp = editing
        ? await db.from("training_plans").update(payload).eq("id", editing.id)
        : await db.from("training_plans").insert(payload);
      if (resp.error) {
        setAuthError(resp.error.message);
        return;
      }
      setOpenForm(false);
      resetForm();
      loadPlans();
    } finally {
      setSaving(false);
    }
  };

  const openAssign = async (p: PlanRow) => {
    setAssignPlan(p);
    setAssignOpen(true);
    setAssignSuccess(null);
    setSelectedUserIds([]);
    await loadUsers();
  };

  const assignedUserIdsForOpenPlan = useMemo(() => {
    if (!assignPlan) return new Set<string>();
    return new Set(
      assignments.filter((a) => a.plan_id === assignPlan.id && a.status === "active").map((a) => a.user_id),
    );
  }, [assignPlan, assignments]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    let list = users.filter((u) => !assignedUserIdsForOpenPlan.has(u.id));
    if (q) {
      list = list.filter(
        (u) => (u.name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [userSearch, users, assignedUserIdsForOpenPlan]);

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const assignToSelected = async () => {
    if (!db || !hasFirebaseConfig || !assignPlan) return;
    const newIds = selectedUserIds.filter((id) => !assignedUserIdsForOpenPlan.has(id));
    if (newIds.length === 0) return;
    setSaving(true);
    setAuthError(null);
    setAssignSuccess(null);
    try {
      const authed = await ensureStaffAuth();
      if (!authed) {
        setAuthError(t("فشل التحقق من صلاحيات الموظف.", "Staff auth failed."));
        return;
      }
      const session = await db.auth.getSession();
      const staffId = session.data.session?.user?.id;
      if (!staffId) {
        setAuthError(t("لا يوجد مستخدم في الجلسة.", "Missing session user."));
        return;
      }

      const rows = newIds.map((uid) => ({
        plan_id: assignPlan.id,
        user_id: uid,
        assigned_by: staffId,
        status: "active",
      }));
      const resp = await db.from("plan_assignments").insert(rows);
      if (resp.error) {
        setAuthError(resp.error.message);
        return;
      }
      setSelectedUserIds([]);
      setAssignSuccess(
        t(`تم إسناد الخطة لـ ${newIds.length} مستخدم.`, `Plan assigned to ${newIds.length} user(s).`),
      );
      await loadPlans();
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (assignmentId: string) => {
    if (!db || !hasFirebaseConfig) return;
    if (!window.confirm(t("إلغاء إسناد هذا المستخدم من الخطة؟", "Remove this user from the plan?"))) return;
    setSaving(true);
    setAuthError(null);
    try {
      const authed = await ensureStaffAuth();
      if (!authed) return;
      const resp = await db.from("plan_assignments").update({ status: "cancelled" }).eq("id", assignmentId);
      if (resp.error) {
        setAuthError(resp.error.message);
        return;
      }
      setAssignSuccess(t("تم إلغاء الإسناد.", "Assignment removed."));
      await loadPlans();
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async (p: PlanRow) => {
    if (!db || !hasFirebaseConfig) return;
    if (
      !window.confirm(
        t(`حذف الخطة «${p.title}» نهائيًا؟ لا يمكن التراجع.`, `Permanently delete plan "${p.title}"? This cannot be undone.`),
      )
    ) {
      return;
    }
    setSaving(true);
    setAuthError(null);
    try {
      const authed = await ensureStaffAuth();
      if (!authed) return;
      const resp = await db.from("training_plans").delete().eq("id", p.id);
      if (resp.error) {
        setAuthError(resp.error.message);
        return;
      }
      if (assignPlan?.id === p.id) {
        setAssignOpen(false);
        setAssignPlan(null);
      }
      if (editing?.id === p.id) setOpenForm(false);
      await loadPlans();
    } finally {
      setSaving(false);
    }
  };

  const currentPlanAssignments = useMemo(() => {
    if (!assignPlan) return [];
    return assignments
      .filter((a) => a.plan_id === assignPlan.id)
      .sort((a, b) => {
        if (a.status === b.status) return 0;
        if (a.status === "active") return -1;
        if (b.status === "active") return 1;
        return 0;
      });
  }, [assignPlan, assignments]);

  return (
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl text-[#F5EAD4] sm:text-2xl">{t("إدارة الخطط", "Plans")}</h1>
          <p className="text-muted-foreground text-sm" style={{ fontSize: 13 }}>
            {t("إنشاء خطط وإسنادها للمستخدمين.", "Create training plans and assign them to users.")} ·{" "}
            <span className={live ? "text-emerald-400" : "text-amber-400"}>
              {live ? t("متصل + Realtime", "Connected + realtime") : t("غير متصل", "Not connected")}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-3 py-2 text-sm font-medium text-[#0B2F24]"
        >
          <Plus className="h-4 w-4" />
          {t("خطة جديدة", "New plan")}
        </button>
      </div>

      {authError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200" style={{ fontSize: 13 }}>
          {authError}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-border">
                {[
                  t("العنوان", "Title"),
                  t("المستوى", "Level"),
                  t("المدة", "Duration"),
                  t("المُسندون", "Assigned"),
                  t("تاريخ الإنشاء", "Created"),
                  t("إجراءات", "Actions"),
                ].map((h) => (
                  <th key={h} className="px-4 py-3 text-start text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => {
                const forPlan = assignments.filter((a) => a.plan_id === p.id && a.status === "active");
                const preview = forPlan
                  .slice(0, 2)
                  .map((a) => a.profile?.name || a.profile?.email || t("مستخدم", "User"))
                  .join(isRTL ? "، " : ", ");
                const more = forPlan.length > 2 ? ` +${forPlan.length - 2}` : "";
                return (
                <tr key={p.id} className="border-b border-border/50 hover:bg-[#D4AF37]/[0.03] transition-colors">
                  <td className="px-4 py-3 text-[#F5EAD4]" style={{ fontSize: 13, fontWeight: 500 }}>
                    {p.title}
                    {p.description ? (
                      <div className="text-muted-foreground" style={{ fontSize: 12 }}>
                        {p.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>
                    {p.level}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>
                    {t(`${p.duration_weeks} أسابيع`, `${p.duration_weeks} weeks`)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>
                    <div className="font-medium text-[#D4AF37]/90">{forPlan.length}</div>
                    {preview ? (
                      <div className="mt-0.5 max-w-[200px] truncate text-muted-foreground" style={{ fontSize: 11 }} title={preview + more}>
                        {preview}
                        {more}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11 }}>—</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>
                    {new Date(p.created_at).toLocaleString(isRTL ? "ar" : "en")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-[#F5EAD4] hover:bg-secondary/70"
                      >
                        {t("تعديل", "Edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => openAssign(p)}
                        className="inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/40 bg-card px-3 py-2 text-xs text-[#D4AF37] hover:bg-[#D4AF37]/10"
                      >
                        <Users className="h-4 w-4" />
                        {t("إسناد", "Assign")}
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePlan(p)}
                        disabled={saving}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-card px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("حذف", "Delete")}
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {plans.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground" style={{ fontSize: 13 }}>
                    {t("لا توجد خطط بعد.", "No plans yet.")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: create/edit */}
      {openForm ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setOpenForm(false)} aria-label="Close" />
          <div className="relative z-10 w-[min(720px,92vw)] rounded-2xl border border-border bg-card p-4 shadow-2xl">
            <h2 className="text-lg text-[#F5EAD4] sm:text-xl">{editing ? t("تعديل خطة", "Edit plan") : t("خطة جديدة", "New plan")}</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-muted-foreground" style={{ fontSize: 12 }}>
                  {t("العنوان", "Title")}
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[#F5EAD4]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-muted-foreground" style={{ fontSize: 12 }}>
                  {t("الوصف", "Description")}
                </label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[#F5EAD4]"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-muted-foreground" style={{ fontSize: 12 }}>
                  {t("المستوى", "Level")}
                </label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[#F5EAD4]"
                >
                  <option value="beginner">{t("مبتدئ", "Beginner")}</option>
                  <option value="intermediate">{t("متوسط", "Intermediate")}</option>
                  <option value="advanced">{t("متقدم", "Advanced")}</option>
                </select>
              </div>
              <div>
                <label className="text-muted-foreground" style={{ fontSize: 12 }}>
                  {t("المدة (أسابيع)", "Duration (weeks)")}
                </label>
                <input
                  type="number"
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[#F5EAD4]"
                  min={1}
                />
              </div>
            </div>
            <PlanJsonEditor value={jsonDraft} onChange={setJsonDraft} t={t} />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenForm(false)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60"
              >
                {t("إلغاء", "Cancel")}
              </button>
              <button
                type="button"
                onClick={savePlan}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-3 py-2 text-sm font-medium text-[#0B2F24] disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? t("جارٍ الحفظ…", "Saving…") : t("حفظ", "Save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal: assign */}
      {assignOpen && assignPlan ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setAssignOpen(false);
              setAssignSuccess(null);
            }}
            aria-label="Close"
          />
          <div className="relative z-10 w-[min(760px,92vw)] rounded-2xl border border-border bg-card p-4 shadow-2xl">
            <h2 className="text-lg text-[#F5EAD4] sm:text-xl">
              {t("إسناد الخطة", "Assign plan")} · {assignPlan.title}
            </h2>
            {assignSuccess ? (
              <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-200" style={{ fontSize: 13 }}>
                {assignSuccess}
              </div>
            ) : null}
            <div className="mt-4">
              <div className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t("المُسندون حاليًا", "Currently assigned")}
              </div>
              <div className="mt-2 max-h-[28vh] overflow-y-auto rounded-xl border border-border">
                {currentPlanAssignments.length === 0 ? (
                  <div className="px-3 py-4 text-center text-muted-foreground" style={{ fontSize: 13 }}>
                    {t("لا يوجد مُسندون بعد.", "No one assigned yet.")}
                  </div>
                ) : (
                  currentPlanAssignments.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[#F5EAD4]" style={{ fontSize: 13 }}>
                          {a.profile?.name || t("مستخدم", "User")}
                        </div>
                        <div className="truncate text-muted-foreground" style={{ fontSize: 12 }} dir="ltr">
                          {a.profile?.email || "—"}
                        </div>
                        <div className="mt-0.5 text-[11px] uppercase text-muted-foreground">{a.status}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAssignment(a.id)}
                        disabled={a.status !== "active"}
                        disabled={saving}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-500/40 px-2 py-1.5 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                        {t("إلغاء", "Remove")}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="mt-4 text-muted-foreground" style={{ fontSize: 12 }}>
              {t("إضافة مستخدمين", "Add users")}
            </div>
            <div className="mt-2">
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder={t("بحث بالاسم أو البريد…", "Search name or email…")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[#F5EAD4]"
              />
            </div>
            <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-xl border border-border">
              {filteredUsers.map((u) => {
                const checked = selectedUserIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUser(u.id)}
                    className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left hover:bg-secondary/50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[#F5EAD4]" style={{ fontSize: 13 }}>
                        {u.name || t("مستخدم", "User")}
                      </div>
                      <div className="truncate text-muted-foreground" style={{ fontSize: 12 }} dir="ltr">
                        {u.email || "—"}
                      </div>
                    </div>
                    <div className={`h-5 w-5 rounded border ${checked ? "bg-[#D4AF37] border-[#D4AF37]" : "border-border"}`} />
                  </button>
                );
              })}
              {filteredUsers.length === 0 ? (
                <div className="px-3 py-6 text-center text-muted-foreground" style={{ fontSize: 13 }}>
                  {t("لا يوجد مستخدمون.", "No users.")}
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <div className="text-muted-foreground" style={{ fontSize: 13 }}>
                {t(`المحدد: ${selectedUserIds.length}`, `Selected: ${selectedUserIds.length}`)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAssignOpen(false);
                    setAssignSuccess(null);
                  }}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60"
                >
                  {t("إغلاق", "Close")}
                </button>
                <button
                  type="button"
                  onClick={assignToSelected}
                  disabled={saving || selectedUserIds.length === 0}
                  className="rounded-lg bg-[#D4AF37] px-3 py-2 text-sm font-medium text-[#0B2F24] disabled:opacity-60"
                >
                  {saving ? t("جارٍ الإسناد…", "Assigning…") : t("إسناد الآن", "Assign")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

