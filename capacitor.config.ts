import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.networth.app',
  appName: 'n38worth',
  server: {
    url: 'https://n38worth.com/',
    androidScheme: 'https',
    allowNavigation: ['*']
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
    // Custom UA token so we can reliably detect the native Android WebView
    // from a remotely-loaded page (where window.Capacitor may not be injected).
    appendUserAgent: "n38worth-android"
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0
    }
  }
};

export default config;
