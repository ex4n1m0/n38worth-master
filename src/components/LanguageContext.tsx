"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  isLocale,
  normalizeLocale,
  translations,
  type Locale,
  type TranslationKeys,
} from "@/lib/i18n";

type LanguageContextType = {
  t: TranslationKeys;
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LanguageContext = createContext<LanguageContextType>({
  t: translations.en,
  locale: "en",
  setLocale: () => {},
});

function persistLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {}
  // Mirrored into a cookie so a future SSR/generateMetadata pass (phase 2,
  // see CHINESE_I18N_STUDY.md) can read the preference server-side.
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // SSR + first client render use English so hydration always matches; the
  // stored/detected locale is applied right after mount.
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    // Priority: ?lang= deep link (shareable n38worth.com/?lang=zh) >
    // stored choice > browser language > English.
    const params = new URLSearchParams(window.location.search);
    const fromUrl = isLocale(params.get("lang"))
      ? (params.get("lang") as Locale)
      : null;
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    const fromStorage = isLocale(stored) ? (stored as Locale) : null;
    const detected = fromUrl ?? fromStorage ?? normalizeLocale(navigator.language);
    if (detected && detected !== "en") {
      setLocaleState(detected);
      persistLocale(detected);
    } else {
      document.documentElement.lang = "en";
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  return (
    <LanguageContext.Provider
      value={{ t: translations[locale], locale, setLocale }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
