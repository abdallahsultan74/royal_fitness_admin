import { useState } from "react";
import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useLang } from "./LanguageContext";

function LayoutInner() {
  const { isRTL } = useLang();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div className="flex min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
      {/* Mobile drawer backdrop */}
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] lg:hidden"
          onClick={closeMobileNav}
        />
      ) : null}

      {/* Mobile drawer sidebar */}
      {mobileNavOpen ? (
        <div
          className={`fixed top-0 bottom-0 z-50 w-[min(280px,88vw)] overflow-y-auto border-border bg-sidebar shadow-2xl lg:hidden ${
            isRTL ? "border-s" : "border-e"
          }`}
          style={{ insetInlineStart: 0 }}
        >
          <Sidebar forceExpanded onNavigate={closeMobileNav} />
        </div>
      ) : null}

      {isRTL ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col">
            <Header onMenuClick={() => setMobileNavOpen(true)} />
            <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              <Outlet />
            </main>
          </div>
          <div className="hidden shrink-0 lg:block">
            <Sidebar />
          </div>
        </>
      ) : (
        <>
          <div className="hidden shrink-0 lg:block">
            <Sidebar />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <Header onMenuClick={() => setMobileNavOpen(true)} />
            <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              <Outlet />
            </main>
          </div>
        </>
      )}
    </div>
  );
}

export function Layout() {
  return <LayoutInner />;
}
