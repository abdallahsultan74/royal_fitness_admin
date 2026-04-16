import { ReactElement } from "react";
import { Navigate } from "react-router";
import { useAdminAuth } from "./AuthContext";
import { useLang } from "./LanguageContext";

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { loading, isAuthenticated } = useAdminAuth();
  const { t } = useLang();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        {t("جار التحميل...", "Loading...")}
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
