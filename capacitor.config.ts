import type { CapacitorConfig } from "@capacitor/cli";

// Toggle live-reload to a hosted URL by setting CAP_SERVER_URL when running cap sync.
// Leave empty for App Store / Play Store builds (bundles dist/ locally).
const liveUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.jenvu.ai",
  appName: "JENVU AI",
  webDir: "dist",
  backgroundColor: "#000000",
  ...(liveUrl
    ? {
        server: {
          url: liveUrl,
          cleartext: false,
        },
      }
    : {}),
  ios: {
    contentInset: "always",
    backgroundColor: "#000000",
  },
  android: {
    backgroundColor: "#000000",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#000000",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#000000",
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
