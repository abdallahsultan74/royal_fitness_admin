import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Dumbbell, Globe, Lock, Mail } from "lucide-react";
import { useLang } from "./LanguageContext";
import { useAdminAuth } from "./AuthContext";

export function Login() {
  const navigate = useNavigate();
  const { lang, toggle, t } = useLang();
  const { login, isAuthenticated, loading } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!loading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof Error && err.message === "Missing credentials") {
        setError(t("يرجى إدخال البريد وكلمة المرور.", "Please enter email and password."));
      } else if (err instanceof Error && err.message === "SUPABASE_NOT_CONFIGURED") {
        setError(t("إعدادات Supabase غير مكتملة.", "Supabase configuration is missing."));
      } else {
        setError(t("فشل تسجيل الدخول، تحقق من البيانات.", "Login failed, check your credentials."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-4 sm:space-y-6 sm:p-6">
        <div className="flex justify-end">
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-[#D4AF37] hover:border-[#D4AF37]/30 transition-colors cursor-pointer"
            style={{ fontSize: 12 }}
          >
            <Globe className="w-4 h-4" />
            {lang === "ar" ? "English" : "عربي"}
          </button>
        </div>

        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
            <Dumbbell className="w-6 h-6 text-[#D4AF37]" />
          </div>
          <h1 className="text-[#F5EAD4]">{t("تسجيل دخول الإدارة", "Admin Login")}</h1>
          <p className="text-muted-foreground" style={{ fontSize: 13 }}>
            {t("أدخل بيانات مدير النظام للمتابعة", "Sign in with your admin credentials")}
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block space-y-1">
            <span className="text-muted-foreground" style={{ fontSize: 12 }}>
              {t("البريد الإلكتروني", "Email")}
            </span>
            <div className="relative">
              <Mail className="w-4 h-4 text-muted-foreground absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full ps-9 pe-3 py-2.5 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
                placeholder="admin@royalfitness.com"
              />
            </div>
          </label>

          <label className="block space-y-1">
            <span className="text-muted-foreground" style={{ fontSize: 12 }}>
              {t("كلمة المرور", "Password")}
            </span>
            <div className="relative">
              <Lock className="w-4 h-4 text-muted-foreground absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full ps-9 pe-3 py-2.5 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
                placeholder="********"
              />
            </div>
          </label>

          {error ? (
            <p className="text-red-400" style={{ fontSize: 12 }}>
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-[#D4AF37] text-[#012217] hover:bg-[#c9a430] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontSize: 14, fontWeight: 600 }}
          >
            {submitting ? t("جاري الدخول...", "Signing in...") : t("دخول", "Sign In")}
          </button>
        </form>
      </div>
    </div>
  );
}
