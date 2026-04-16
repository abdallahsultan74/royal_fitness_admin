import { useState } from "react";
import { NavLink } from "react-router";
import {
  LayoutDashboard,
  Dumbbell,
  Users,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Crown,
  BarChart3,
  MessageSquare,
  CreditCard,
} from "lucide-react";
import { useLang } from "./LanguageContext";

const navItems = [
  { to: "/", icon: LayoutDashboard, ar: "لوحة التحكم", en: "Dashboard" },
  { to: "/exercises", icon: Dumbbell, ar: "إدارة التمارين", en: "Exercises" },
  { to: "/users", icon: Users, ar: "إدارة المستخدمين", en: "Users" },
  { to: "/subscriptions", icon: CreditCard, ar: "الاشتراكات", en: "Subscriptions" },
  { to: "/analytics", icon: BarChart3, ar: "التحليلات", en: "Analytics" },
  { to: "/support", icon: MessageSquare, ar: "الدعم الفني", en: "Support" },
  { to: "/settings", icon: Settings, ar: "الإعدادات", en: "Settings" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { t, isRTL } = useLang();

  return (
    <aside
      className={`h-screen sticky top-0 flex flex-col border-s border-sidebar-border bg-sidebar transition-all duration-300 ${
        collapsed ? "w-[72px]" : "w-[260px]"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-sidebar-border">
        <div className="relative flex-shrink-0 w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center">
          <Dumbbell className="w-5 h-5 text-[#D4AF37]" />
          <Crown className="w-3 h-3 text-[#D4AF37] absolute -top-1 -start-1" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-[#D4AF37] tracking-wider" style={{ fontSize: 13, fontWeight: 700 }}>
              {t("رويال فيتنس", "ROYAL FITNESS")}
            </p>
            <p className="text-muted-foreground" style={{ fontSize: 10, letterSpacing: "0.1em" }}>
              {t("لوحة الإدارة", "ADMIN PANEL")}
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.en}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                isActive
                  ? "bg-[#D4AF37]/10 text-[#D4AF37]"
                  : "text-muted-foreground hover:text-[#F5EAD4] hover:bg-[#D4AF37]/5"
              } ${collapsed ? "justify-center" : ""}`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={`w-5 h-5 flex-shrink-0 ${
                    isActive ? "text-[#D4AF37]" : "text-muted-foreground group-hover:text-[#D4AF37]"
                  }`}
                />
                {!collapsed && (
                  <span style={{ fontSize: 14 }}>{t(item.ar, item.en)}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center gap-2 px-3 py-4 border-t border-sidebar-border text-muted-foreground hover:text-[#D4AF37] transition-colors cursor-pointer"
      >
        {collapsed ? (
          isRTL ? <ChevronsLeft className="w-5 h-5" /> : <ChevronsRight className="w-5 h-5" />
        ) : (
          <>
            {isRTL ? <ChevronsRight className="w-5 h-5" /> : <ChevronsLeft className="w-5 h-5" />}
            <span style={{ fontSize: 13 }}>{t("طي القائمة", "Collapse")}</span>
          </>
        )}
      </button>
    </aside>
  );
}
