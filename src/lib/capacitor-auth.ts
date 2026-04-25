import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";

/**
 * Detect if running in Capacitor (native app)
 */
export function isCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  if (w.Capacitor?.isNativePlatform?.()) return true;
  // Fallback: the app loads a remote URL (https://n38worth.com) so the
  // Capacitor JS bridge is not always injected. We tag the Android WebView
  // user-agent via capacitor.config.ts (appendUserAgent: "n38worth-android")
  // and also detect the generic Android WebView marker "; wv)".
  const ua = (navigator && navigator.userAgent) || "";
  if (/n38worth-android/i.test(ua)) return true;
  if (/Android/i.test(ua) && /; wv\)/.test(ua)) return true;
  return false;
}

/**
 * Open Google OAuth in system browser for Capacitor apps.
 * This avoids the disallowed_useragent error that occurs when
 * opening OAuth in an embedded WebView.
 */
export async function signInWithGoogleInBrowser(callbackUrl: string = "/my-profile") {
  // In NextAuth v5 a plain GET to /api/auth/signin/google no longer starts the
  // OAuth flow — it returns the "Server error — Configuration" page. We route
  // through our own /api/mobile-signin/google handler which POSTs the CSRF
  // token server-side and then 302-redirects the system browser to Google's
  // OAuth consent screen.
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://n38worth.com";
  const oauthUrl = `${baseUrl}/api/mobile-signin/google?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  await Browser.open({
    url: oauthUrl,
    presentationStyle: "popover",
  });
}

/**
 * Listen for browser close event and app URL open to refresh the page
 * after OAuth completes (user returns to app)
 */
export function setupBrowserAuthListener(onAuthComplete: () => void) {
  // Listen for browser close event
  Browser.addListener("browserFinished", () => {
    // Give a small delay for the session to be established
    setTimeout(() => {
      onAuthComplete();
    }, 500);
  });

  // Listen for app URL open (deep link callback)
  App.addListener("appUrlOpen", (data: { url: string }) => {
    console.log("App opened with URL:", data.url);
    // Check if this is an OAuth callback
    if (data.url.includes("auth/callback") || data.url.includes("com.networth.app")) {
      // Give a small delay for the session to be established
      setTimeout(() => {
        onAuthComplete();
      }, 500);
    }
  });
}

/**
 * Clean up browser and app listeners
 */
export async function cleanupBrowserAuthListener() {
  await Browser.removeAllListeners();
  await App.removeAllListeners();
}
