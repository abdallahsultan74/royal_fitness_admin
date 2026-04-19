import { useState } from "react";
import { Search, Bell, Globe, ChevronDown, Menu } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useLang } from "./LanguageContext";
import { useAdminAuth } from "./AuthContext";

type HeaderProps = {
  onMenuClick?: () => void;
};

export function Header({ onMenuClick }: HeaderProps) {
  const { lang, toggle, t } = useLang();
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [headerQuery, setHeaderQuery] = useState("");

  const submitGlobalSearch = () => {
    const q = headerQuery.trim();
    if (!q) return;
    const onExercises = location.pathname.includes("/exercises");
    const base = onExercises ? "/exercises" : "/users";
    navigate(`${base}?q=${encodeURIComponent(q)}`);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border bg-background/80 px-3 py-2 backdrop-blur-md sm:min-h-16 sm:px-4 sm:py-2 md:px-6">
      {/* Toolbar row: menu (mobile) + profile cluster */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3 md:gap-4 lg:flex-initial">
        {onMenuClick ? (
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex shrink-0 rounded-lg border border-border p-2 text-[#D4AF37] transition-colors hover:bg-secondary lg:hidden"
            aria-label={t("القائمة", "Menu")}
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}
        <div className="flex min-w-0 cursor-pointer items-center gap-2 border-border pe-2 sm:gap-3 sm:pe-4 sm:border-e">
          <div className="w-9 h-9 rounded-full border-2 border-[#D4AF37] bg-secondary flex items-center justify-center text-[#D4AF37]" style={{ fontSize: 13, fontWeight: 600 }}>
            {t("م أ", "RA")}
          </div>
          <div className="hidden md:block">
            <p className="text-foreground" style={{ fontSize: 13, fontWeight: 500 }}>
              {user?.name ?? t("مدير النظام", "Royal Admin")}
            </p>
            <p className="text-muted-foreground" style={{ fontSize: 11 }}>
              {user?.email ?? t("مشرف رئيسي", "Super Admin")}
            </p>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </div>

        <button
          type="button"
          onClick={() => navigate("/notifications")}
          className="relative cursor-pointer rounded-lg p-2 transition-colors hover:bg-secondary"
        >
          <Bell className="w-5 h-5 text-[#D4AF37]" />
          <span className="absolute top-1 start-1 w-2 h-2 bg-[#D4AF37] rounded-full" />
        </button>

        {/* Language toggle */}
        <button
          type="button"
          onClick={toggle}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-muted-foreground transition-colors hover:border-[#D4AF37]/30 hover:text-[#D4AF37] sm:px-3"
          style={{ fontSize: 12 }}
        >
          <Globe className="w-4 h-4" />
          {lang === "ar" ? "English" : "عربي"}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="cursor-pointer rounded-lg border border-border px-2 py-1.5 text-muted-foreground transition-colors hover:border-red-400/30 hover:text-red-400 sm:px-3"
          style={{ fontSize: 12 }}
        >
          {t("تسجيل خروج", "Logout")}
        </button>
      </div>

      {/* Search: full width on narrow screens */}
      <form
        className="relative w-full min-w-0 basis-full sm:basis-auto sm:max-w-md lg:max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          submitGlobalSearch();
        }}
      >
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={headerQuery}
          onChange={(e) => setHeaderQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitGlobalSearch();
            }
          }}
          placeholder={t("ابحث عن مستخدمين، تمارين، تقارير...", "Search users, exercises, reports...")}
          className="w-full rounded-lg border border-border bg-secondary py-2 ps-10 pe-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
          style={{ fontSize: 13 }}
          aria-label={t("بحث في المشروع", "Project search")}
        />
      </form>
    </header>
  );
}
