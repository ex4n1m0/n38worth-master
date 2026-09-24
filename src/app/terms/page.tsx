"use client";

import { useLanguage } from "@/components/LanguageContext";

export default function TermsOfService() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 py-16 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-white">{t.termsTitle}</h1>
        <p className="text-sm text-gray-500">{t.lastUpdated}</p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.termsAcceptTitle}</h2>
          <p>{t.termsAcceptP1}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.termsDescTitle}</h2>
          <p>{t.termsDescP1}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.termsAccountTitle}</h2>
          <p>{t.termsAccountP1}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.termsMechanicsTitle}</h2>
          <p>{t.termsMechanicsP1}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.termsConductTitle}</h2>
          <p>{t.termsConductIntro}</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>{t.termsConductLi1}</li>
            <li>{t.termsConductLi2}</li>
            <li>{t.termsConductLi3}</li>
            <li>{t.termsConductLi4}</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.termsTerminationTitle}</h2>
          <p>{t.termsTerminationP1}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.termsDisclaimerTitle}</h2>
          <p>{t.termsDisclaimerP1}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">{t.termsChangesTitle}</h2>
          <p>{t.termsChangesP1}</p>
        </section>
      </div>
    </div>
  );
}
