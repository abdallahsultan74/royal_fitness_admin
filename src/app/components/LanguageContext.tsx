import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Lang = "ar" | "en";

interface LanguageContextType {
  lang: Lang;
  isRTL: boolean;
  toggle: () => void;
  t: (ar: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "ar",
  isRTL: true,
  toggle: () => {},
  t: (ar) => ar,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") return "ar";
    const saved = localStorage.getItem("royal_admin_lang");
    return saved === "en" ? "en" : "ar";
  });
  const isRTL = lang === "ar";
  const toggle = () =>
    setLang((l) => {
      const next = l === "ar" ? "en" : "ar";
      if (typeof window !== "undefined") {
        localStorage.setItem("royal_admin_lang", next);
      }
      return next;
    });
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
  }, [isRTL, lang]);

  return (
    <LanguageContext.Provider value={{ lang, isRTL, toggle, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLang = () => useContext(LanguageContext);
