import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useLang } from "./LanguageContext";
import { useIsMobile } from "./ui/use-mobile";

function LayoutInner() {
  const { isRTL } = useLang();
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) {
      setMobileSidebarOpen(false);
    }
  }, [isMobile]);

  if (isMobile) {
    return (
      <div className="flex min-h-screen bg-background relative" dir={isRTL ? "rtl" : "ltr"}>
        <Sidebar
          isMobile
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
        {mobileSidebarOpen && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/50"
          />
        )}
        <div className="flex-1 flex flex-col min-w-0">
          <Header showMenuButton onMenuClick={() => setMobileSidebarOpen(true)} />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
      {isRTL ? (
        <>
          <div className="flex-1 flex flex-col min-w-0">
            <Header />
            <main className="flex-1 overflow-auto">
              <Outlet />
            </main>
          </div>
          <Sidebar />
        </>
      ) : (
        <>
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Header />
            <main className="flex-1 overflow-auto">
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
