import { Search, Bell, Globe, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router";
import { useLang } from "./LanguageContext";
import { useAdminAuth } from "./AuthContext";

export function Header() {
  const { lang, toggle, t } = useLang();
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between h-16 px-6 border-b border-border bg-background/80 backdrop-blur-md">
      {/* Profile side */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 pe-4 border-e border-border cursor-pointer">
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
          onClick={() => navigate("/notifications")}
          className="relative p-2 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
        >
          <Bell className="w-5 h-5 text-[#D4AF37]" />
          <span className="absolute top-1 start-1 w-2 h-2 bg-[#D4AF37] rounded-full" />
        </button>

        {/* Language toggle */}
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-[#D4AF37] hover:border-[#D4AF37]/30 transition-colors cursor-pointer"
          style={{ fontSize: 12 }}
        >
          <Globe className="w-4 h-4" />
          {lang === "ar" ? "English" : "عربي"}
        </button>

        <button
          onClick={handleLogout}
          className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/30 transition-colors cursor-pointer"
          style={{ fontSize: 12 }}
        >
          {t("تسجيل خروج", "Logout")}
        </button>
      </div>

      {/* Search */}
      <div className="relative w-full max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={t("ابحث عن مستخدمين، تمارين، تقارير...", "Search users, exercises, reports...")}
          className="w-full ps-10 pe-4 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
          style={{ fontSize: 13 }}
        />
      </div>
    </header>
  );
}
