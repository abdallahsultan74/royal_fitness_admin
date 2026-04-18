import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Save, Users } from "lucide-react";
import { useLang } from "./LanguageContext";
import { db, ensureAdminAuth, hasFirebaseConfig } from "../firebase";

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

export function Plans() {
  const { t, isRTL } = useLang();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // create/edit form
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [level, setLevel] = useState("beginner");
  const [weeks, setWeeks] = useState(4);

  // assignment
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPlan, setAssignPlan] = useState<PlanRow | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState<ProfileLite[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const resetForm = () => {
    setEditing(null);
    setTitle("");
    setDesc("");
    setLevel("beginner");
    setWeeks(4);
  };

  const loadPlans = useCallback(async () => {
    if (!db || !hasFirebaseConfig) return;
    setLoading(true);
    setAuthError(null);
    try {
      await ensureAdminAuth();
      const resp = await db.from("training_plans").select("*").order("created_at", { ascending: false });
      if (resp.error) setAuthError(resp.error.message);
      setPlans((resp.data ?? []) as any);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    if (!db || !hasFirebaseConfig) return;
    try {
      await ensureAdminAuth();
      const resp = await db.from("profiles").select("id, name, email").order("created_at", { ascending: false }).limit(200);
      setUsers((resp.data ?? []) as any);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const openCreate = () => {
    resetForm();
    setOpenForm(true);
  };

  const openEdit = (p: PlanRow) => {
    setEditing(p);
    setTitle(p.title ?? "");
    setDesc(p.description ?? "");
    setLevel(p.level ?? "beginner");
    setWeeks(Number(p.duration_weeks ?? 4));
    setOpenForm(true);
  };

  const savePlan = async () => {
    if (!db || !hasFirebaseConfig) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    setAuthError(null);
    try {
      await ensureAdminAuth();
      const payload: any = {
        title: trimmed,
        description: desc.trim() || null,
        level,
        duration_weeks: Number.isFinite(weeks) ? weeks : 4,
        json_plan: {},
      };
      const resp = editing
        ? await db.from("training_plans").update(payload).eq("id", editing.id)
        : await db.from("training_plans").insert(payload);
      if (resp.error) setAuthError(resp.error.message);
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
    setSelectedUserIds([]);
    await loadUsers();
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q));
  }, [userSearch, users]);

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const assignToSelected = async () => {
    if (!db || !hasFirebaseConfig || !assignPlan) return;
    if (selectedUserIds.length === 0) return;
    setSaving(true);
    setAuthError(null);
    try {
      await ensureAdminAuth();
      const rows = selectedUserIds.map((uid) => ({ plan_id: assignPlan.id, user_id: uid, status: "active" }));
      const resp = await db.from("plan_assignments").insert(rows);
      if (resp.error) setAuthError(resp.error.message);
      setAssignOpen(false);
      setAssignPlan(null);
      setSelectedUserIds([]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl text-[#F5EAD4] sm:text-2xl">{t("إدارة الخطط", "Plans")}</h1>
          <p className="text-muted-foreground text-sm" style={{ fontSize: 13 }}>
            {t("إنشاء خطط وإسنادها للمستخدمين.", "Create training plans and assign them to users.")}
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
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-border">
                {[
                  t("العنوان", "Title"),
                  t("المستوى", "Level"),
                  t("المدة", "Duration"),
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
              {plans.map((p) => (
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
                    {new Date(p.created_at).toLocaleString(isRTL ? "ar" : "en")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
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
                    </div>
                  </td>
                </tr>
              ))}
              {plans.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground" style={{ fontSize: 13 }}>
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
          <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setAssignOpen(false)} aria-label="Close" />
          <div className="relative z-10 w-[min(760px,92vw)] rounded-2xl border border-border bg-card p-4 shadow-2xl">
            <h2 className="text-lg text-[#F5EAD4] sm:text-xl">
              {t("إسناد الخطة", "Assign plan")} · {assignPlan.title}
            </h2>
            <div className="mt-3">
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
                  onClick={() => setAssignOpen(false)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60"
                >
                  {t("إلغاء", "Cancel")}
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

