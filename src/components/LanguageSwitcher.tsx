"use client";

import { Check, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "./LanguageContext";
import { useSound } from "@/hooks/useSound";
import { LOCALES, languageFlags, languageNames } from "@/lib/i18n";

/**
 * Top-right language dropdown (English / 简体中文). `icon` matches the
 * navbar's compact ghost buttons; `pill` matches the landing/auth pages'
 * bordered circular buttons.
 */
export function LanguageSwitcher({
  variant = "icon",
}: {
  variant?: "icon" | "pill";
}) {
  const { t, locale, setLocale } = useLanguage();
  const { play } = useSound();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-8 w-8 text-gray-400 hover:text-white"
            title={t.language}
            aria-label={t.language}
          >
            <Languages className="h-4 w-4" />
          </Button>
        ) : (
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/5 p-2.5 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            aria-label={t.language}
            title={t.language}
          >
            <Languages className="h-4 w-4" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-gray-900 border-gray-800">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => {
              if (l !== locale) {
                play("click");
                setLocale(l);
              }
            }}
            className="cursor-pointer text-gray-300"
            aria-checked={l === locale}
          >
            <span className="mr-2">{languageFlags[l]}</span>
            <span className={l === locale ? "font-semibold text-white" : ""}>
              {languageNames[l]}
            </span>
            {l === locale && <Check className="ml-auto h-4 w-4 text-green-400" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
