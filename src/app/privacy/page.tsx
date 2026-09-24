"use client";

import { useLanguage } from "@/components/LanguageContext";

export default function PrivacyPolicy() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 py-16 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-white">{t.privacyTitle}</h1>
        <p className="text-sm text-gray-500">{t.lastUpdated}</p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.privacyCollectTitle}</h2>
          <p>
            {t.privacyCollectP1Prefix} <strong>{t.privacyCollectP1Name}</strong>{" "}
            {t.privacyCollectP1Mid} <strong>{t.privacyCollectP1Picture}</strong>{" "}
            {t.privacyCollectP1Suffix}
          </p>
          <p>{t.privacyCollectP2}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.privacyUseTitle}</h2>
          <p>{t.privacyUseIntro}</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>{t.privacyUseLi1}</li>
            <li>{t.privacyUseLi2}</li>
            <li>{t.privacyUseLi3}</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.privacySharingTitle}</h2>
          <p>
            {t.privacySharingP1Prefix} <strong>{t.privacySharingP1Not}</strong>{" "}
            {t.privacySharingP1Suffix}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.privacyStorageTitle}</h2>
          <p>{t.privacyStorageP1}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.privacyDeletionTitle}</h2>
          <p>{t.privacyDeletionP1}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.privacyCookiesTitle}</h2>
          <p>{t.privacyCookiesP1}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.privacyChangesTitle}</h2>
          <p>{t.privacyChangesP1}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.privacyContactTitle}</h2>
          <p>{t.privacyContactP1}</p>
        </section>
      </div>
    </div>
  );
}
