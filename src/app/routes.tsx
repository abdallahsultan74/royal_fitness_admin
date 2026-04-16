import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { ExerciseManagement } from "./components/ExerciseManagement";
import { UserManagement } from "./components/UserManagement";
import { SettingsPage } from "./components/SettingsPage";
import { Login } from "./components/Login";
import { ProtectedRoute } from "./components/ProtectedRoute";

function ComingSoon() {
  return (
    <div className="p-6">
      <h2 className="text-[#F5EAD4]">Coming soon</h2>
      <p className="text-muted-foreground" style={{ fontSize: 14 }}>
        This section is being migrated to Supabase.
      </p>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/",
    Component: () => (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, Component: Dashboard },
      { path: "exercises", Component: ExerciseManagement },
      { path: "users", Component: UserManagement },
      { path: "subscriptions", Component: ComingSoon },
      { path: "analytics", Component: ComingSoon },
      { path: "support", Component: ComingSoon },
      { path: "settings", Component: SettingsPage },
      { path: "notifications", Component: ComingSoon },
    ],
  },
]);
