"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "@/components/OnboardingContext";
import { PROFESSIONS, professionName } from "@/lib/professions";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/event-feed";
import { useLanguage } from "@/components/LanguageContext";

export function OnboardingProfessionStep() {
  const { state, loading, refresh } = useOnboarding();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [selectedProfession, setSelectedProfession] = useState<string | null>(
    state.profession ?? null
  );
  const [submitting, setSubmitting] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/professions/counts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.counts) setCounts(data.counts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Don't show while loading or if onboarding already complete
  if (loading || state.onboardingComplete) return null;
  // Don't show until avatar is uploaded
  if (!state.avatarCompleted) return null;
  // Don't show if profession already selected
  if (state.professionSelected) return null;

  const handleSelect = (professionName: string) => {
    setSelectedProfession(professionName);
  };

  const handleSubmit = async () => {
    if (!selectedProfession || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/profession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profession: selectedProfession }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t.selectProfessionFailed);
      }

      toast.success(t.onboardingNowProfession.replace("{profession}", professionName(selectedProfession, locale)));
      await refresh();
      // Onboarding is complete — send the player to their profile page, where
      // the daily reward auto-claims and they can see their rewards & income.
      router.push("/my-profile");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t.selectProfessionFailed
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
      <div className="relative w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900/95 p-6 sm:p-8 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/30 mb-4">
            <ShieldCheck className="h-8 w-8 text-amber-400" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-amber-300 to-yellow-400 bg-clip-text text-transparent">
            {t.chooseYourProfession}
          </h2>
          <p className="text-gray-400 mt-2 text-sm sm:text-base">
            {t.onboardingProfessionDesc}
          </p>
        </div>

        {/* Profession Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
          {PROFESSIONS.map((prof) => {
            const isSelected = selectedProfession === prof.name;
            return (
              <button
                key={prof.name}
                onClick={() => handleSelect(prof.name)}
                className={`relative flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl border-2 transition-all duration-200 ${
                  isSelected
                    ? "border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/20 scale-105"
                    : "border-gray-700 bg-gray-800/50 hover:border-gray-500 hover:bg-gray-800/80"
                }`}
              >
                {/* Checkmark overlay */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-gray-900"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
                {/* Profession image */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gray-950/50 border border-gray-700/50 flex-shrink-0">
                  <img
                    src={prof.imagePath}
                    alt={professionName(prof.name, locale)}
                    className="w-full h-full object-contain p-1"
                  />
                </div>
                {/* Profession name */}
                <span
                  className={`text-xs sm:text-sm font-semibold text-center leading-tight ${
                    isSelected ? "text-amber-300" : "text-gray-300"
                  }`}
                >
                  {professionName(prof.name, locale)}
                </span>
                {/* Current count in game */}
                <span className="text-[10px] sm:text-xs text-gray-500 leading-tight">
                  {(counts[prof.name] ?? 0).toLocaleString()} {t.inTheGrid}
                </span>
              </button>
            );
          })}
        </div>

        {/* Submit button */}
        <div className="flex justify-center">
          <Button
            onClick={handleSubmit}
            disabled={!selectedProfession || submitting}
            className={`px-8 py-3 rounded-lg font-bold text-base transition-all duration-200 ${
              selectedProfession && !submitting
                ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-gray-900 hover:from-amber-400 hover:to-yellow-400 shadow-lg shadow-amber-500/30"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                {t.choosing}
              </>
            ) : selectedProfession ? (
              t.becomeA.replace("{profession}", professionName(selectedProfession, locale))
            ) : (
              t.selectAProfession
            )}
          </Button>
        </div>

        {/* Footer note */}
        <p className="text-center text-gray-500 text-xs mt-4">
          {t.someProfessionsRarer}
        </p>
      </div>
    </div>
  );
}