import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useLang } from "./LanguageContext";

function LayoutInner() {
  const { isRTL } = useLang();

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
