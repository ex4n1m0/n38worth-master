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
 * Get dynamic font size class based on number value to prevent overflow
 * Larger numbers get smaller font sizes
 */
export function getDynamicFontSize(num: number): string {
  const absNum = Math.abs(num);
  
  if (absNum >= 1_000_000_000) { // 1 billion+
    return 'text-[8px]';
  } else if (absNum >= 100_000_000) { // 100 million+
    return 'text-[9px]';
  } else if (absNum >= 1_000_000) { // 1 million+
    return 'text-[10px]';
  } else {
    return 'text-xs'; // Default size
  }
}
