"use client";

import { useLanguage } from "@/components/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

// Served to every non-desktop visitor once the Windows-only gate is active
// (src/proxy.ts): the browser and Android versions are retired and this page
// is the public face of the game. Keep it dependency-free — no auth, no APIs.
export default function WindowsOnlyPage() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 flex flex-col items-center justify-center px-6 py-16 relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher variant="pill" />
      </div>

      <main className="max-w-xl mx-auto text-center space-y-6">
        <img
          src="/VW_Icon.png"
          alt="n38worth"
          width={96}
          height={96}
          className="mx-auto opacity-90"
        />

        <p className="inline-block text-xs font-semibold uppercase tracking-widest text-amber-400 border border-amber-400/30 bg-amber-400/10 rounded-full px-3 py-1">
          {t.windowsOnlyBadge}
        </p>

        <h1 className="text-4xl font-bold text-white leading-tight">
          {t.windowsOnlyTitle}
        </h1>

        <p className="text-lg text-gray-400">{t.windowsOnlyBody}</p>

        <div className="pt-2 space-y-2">
          <p className="text-sm font-semibold text-gray-200">
            {t.windowsOnlyDownload} — {t.windowsOnlySoon}
          </p>
        </div>

        <p className="text-sm text-gray-500 border-t border-gray-800 pt-6">
          {t.windowsOnlyExisting}
        </p>
      </main>
    </div>
  );
}
