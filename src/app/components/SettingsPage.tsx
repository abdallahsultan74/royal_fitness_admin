import { useEffect, useState } from "react";
import { useLang } from "./LanguageContext";
import { hasFirebaseConfig } from "../firebase";

type SettingsState = {
  appName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  autoApproveExercises: boolean;
};

const STORAGE_KEY = "royal_admin_settings";

const defaultSettings: SettingsState = {
  appName: "Royal Fitness",
  supportEmail: "support@royalfitness.com",
  maintenanceMode: false,
  autoApproveExercises: false,
};

function loadFromStorage(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    return {
      appName: typeof parsed.appName === "string" ? parsed.appName : defaultSettings.appName,
      supportEmail: typeof parsed.supportEmail === "string" ? parsed.supportEmail : defaultSettings.supportEmail,
      maintenanceMode: Boolean(parsed.maintenanceMode),
      autoApproveExercises: Boolean(parsed.autoApproveExercises),
    };
  } catch {
    return defaultSettings;
  }
}

export function SettingsPage() {
  const { t } = useLang();
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadFromStorage());
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    setSaved(false);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="min-w-0">
        <h1 className="text-xl text-[#F5EAD4] sm:text-2xl">{t("الإعدادات", "Settings")}</h1>
        <p className="text-muted-foreground text-sm sm:text-[14px]">
          {t("إعدادات النظام العامة ولوحات الإدارة", "Global system and admin preferences")}
          {hasFirebaseConfig
            ? ` · ${t("محفوظة في هذا المتصفح", "Stored in this browser")}`
            : ` · ${t("وضع محلي", "Local only")}`}
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <label className="block space-y-1">
          <span className="text-muted-foreground" style={{ fontSize: 12 }}>{t("اسم التطبيق", "App name")}</span>
          <input
            value={settings.appName}
            onChange={(e) => setSettings((prev) => ({ ...prev, appName: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-muted-foreground" style={{ fontSize: 12 }}>{t("بريد الدعم", "Support email")}</span>
          <input
            value={settings.supportEmail}
            onChange={(e) => setSettings((prev) => ({ ...prev, supportEmail: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          />
        </label>

        <label className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 text-foreground" style={{ fontSize: 13 }}>{t("وضع الصيانة", "Maintenance mode")}</span>
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 self-start sm:self-auto"
            checked={settings.maintenanceMode}
            onChange={(e) => setSettings((prev) => ({ ...prev, maintenanceMode: e.target.checked }))}
          />
        </label>

        <label className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 text-foreground" style={{ fontSize: 13 }}>{t("موافقة تلقائية على التمارين", "Auto-approve exercises")}</span>
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 self-start sm:self-auto"
            checked={settings.autoApproveExercises}
            onChange={(e) => setSettings((prev) => ({ ...prev, autoApproveExercises: e.target.checked }))}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#012217] hover:bg-[#c9a430] disabled:opacity-60"
          >
            {saving ? t("جار الحفظ...", "Saving...") : t("حفظ الإعدادات", "Save settings")}
          </button>
          {saved ? <span className="text-emerald-400" style={{ fontSize: 12 }}>{t("تم الحفظ", "Saved")}</span> : null}
        </div>
      </div>
    </div>
  );
}
