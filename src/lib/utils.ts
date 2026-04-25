import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number with comma-separated thousands (e.g., 1000 -> "1,000")
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Get the character length of a formatted number (including commas and ¢ suffix)
 * Used internally to determine font sizing based on visual width.
 */
function getFormattedLength(num: number): number {
  return formatNumber(Math.abs(num)).length;
}

/**
 * Dynamic font size for SMALL contexts: badges, hire buttons, stat row values.
 * Base size: text-xs (~12px). Scales down for large numbers.
 */
export function getDynamicFontSize(num: number): string {
  const len = getFormattedLength(num);
  if (len >= 15) return 'text-[7px]';
  if (len >= 13) return 'text-[8px]';
  if (len >= 11) return 'text-[9px]';
  if (len >= 9)  return 'text-[10px]';
  if (len >= 7)  return 'text-[11px]';
  return 'text-xs';
}

/**
 * Dynamic font size for STAT BOXES: the 4 stat grid cells on profile pages.
 * Base size: text-lg sm:text-2xl. Scales down to keep numbers inside their box.
 */
export function getDynamicStatFontSize(num: number): string {
  const len = getFormattedLength(num);
  if (len >= 15) return 'text-[9px] sm:text-xs';
  if (len >= 13) return 'text-[10px] sm:text-sm';
  if (len >= 11) return 'text-xs sm:text-sm';
  if (len >= 9)  return 'text-xs sm:text-base';
  if (len >= 7)  return 'text-sm sm:text-lg';
  return 'text-lg sm:text-2xl';
}

/**
 * Dynamic font size for INLINE stats: dashboard header credits/portfolio values.
 * Base size: text-base sm:text-xl. Scales down for large numbers.
 */
export function getDynamicInlineFontSize(num: number): string {
  const len = getFormattedLength(num);
  if (len >= 15) return 'text-[9px] sm:text-xs';
  if (len >= 13) return 'text-[10px] sm:text-sm';
  if (len >= 11) return 'text-xs sm:text-sm';
  if (len >= 9)  return 'text-xs sm:text-base';
  if (len >= 7)  return 'text-sm sm:text-lg';
  return 'text-base sm:text-xl';
}

/**
 * Dynamic font size for CARD stat values: MyProfileCard grid cells.
 * Base size: text-lg sm:text-xl. Scales down for large numbers.
 */
export function getDynamicCardStatFontSize(num: number): string {
  const len = getFormattedLength(num);
  if (len >= 15) return 'text-[9px] sm:text-[10px]';
  if (len >= 13) return 'text-[10px] sm:text-xs';
  if (len >= 11) return 'text-xs sm:text-sm';
  if (len >= 9)  return 'text-xs sm:text-base';
  if (len >= 7)  return 'text-sm sm:text-lg';
  return 'text-lg sm:text-xl';
}

/**
 * Dynamic font size for MOSAIC overlay: large values shown over player images.
 * Base size: text-base sm:text-lg. Scales down for large numbers.
 */
export function getDynamicMosaicFontSize(num: number): string {
  const len = getFormattedLength(num);
  if (len >= 15) return 'text-[8px] sm:text-[10px]';
  if (len >= 13) return 'text-[9px] sm:text-xs';
  if (len >= 11) return 'text-[10px] sm:text-xs';
  if (len >= 9)  return 'text-xs sm:text-sm';
  if (len >= 7)  return 'text-xs sm:text-base';
  return 'text-sm sm:text-base md:text-lg';
}

/**
 * Dynamic font size for MOSAIC HIRE button text.
 * Base was text-[14px] sm:text-[20px] md:text-[28px] lg:text-[36px] — way too large.
 */
export function getDynamicMosaicHireFontSize(num: number): string {
  const len = getFormattedLength(num);
  if (len >= 13) return 'text-[8px] sm:text-[10px] md:text-xs';
  if (len >= 11) return 'text-[9px] sm:text-xs md:text-sm';
  if (len >= 9)  return 'text-[10px] sm:text-xs md:text-sm lg:text-base';
  if (len >= 7)  return 'text-xs sm:text-sm md:text-base lg:text-lg';
  return 'text-xs sm:text-sm md:text-lg lg:text-xl';
}

/**
 * Dynamic font size for NAVBAR credit balance pill.
 * Base size: text-sm. Scales down for large numbers.
 */
export function getDynamicNavFontSize(num: number): string {
  const len = getFormattedLength(num);
  if (len >= 13) return 'text-[8px]';
  if (len >= 11) return 'text-[9px]';
  if (len >= 9)  return 'text-[10px]';
  if (len >= 7)  return 'text-[11px]';
  return 'text-sm';
}
