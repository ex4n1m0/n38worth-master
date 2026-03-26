"use client";

import { createContext, useContext, type ReactNode } from "react";
import { translations } from "@/lib/i18n";

type LanguageContextType = {
  t: typeof translations["en"];
};

const LanguageContext = createContext<LanguageContextType>({
  t: translations.en,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  return (
    <LanguageContext.Provider value={{ t: translations.en }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}