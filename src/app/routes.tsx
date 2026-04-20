import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { ExerciseManagement } from "./components/ExerciseManagement";
import { UserManagement } from "./components/UserManagement";
import { UserDetailsPage } from "./components/UserDetailsPage";
import { Plans } from "./components/Plans";
import { SettingsPage } from "./components/SettingsPage";
import { Subscriptions } from "./components/Subscriptions";
import { Notifications } from "./components/Notifications";
import { ChallengesManagement } from "./components/ChallengesManagement";
import { AnalyticsPage } from "./components/AnalyticsPage";
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

function routerBasename(): string | undefined {
  const raw = import.meta.env.BASE_URL;
  if (!raw || raw === '/') return undefined;
  const trimmed = raw.replace(/\/$/, '');
  return trimmed || undefined;
}

const basename = routerBasename();

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
      { path: "users/:id", Component: UserDetailsPage },
      { path: "plans", Component: Plans },
      { path: "challenges", Component: ChallengesManagement },
      { path: "subscriptions", Component: Subscriptions },
      { path: "analytics", Component: AnalyticsPage },
      { path: "settings", Component: SettingsPage },
      { path: "notifications", Component: Notifications },
    ],
  },
], basename ? { basename } : {});
