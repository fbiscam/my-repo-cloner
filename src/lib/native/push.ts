import { PushNotifications } from "@capacitor/push-notifications";
import { isNative } from "./platform";

/**
 * Registers the device for push notifications and POSTs the token to /api/public/push-register.
 * Call once after the user signs in.
 */
export async function registerPushNotifications(userId: string) {
  if (!isNative()) return;

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") return;

  await PushNotifications.register();

  PushNotifications.addListener("registration", async (token) => {
    try {
      await fetch("/api/public/push-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, token: token.value }),
      });
    } catch (e) {
      console.warn("[push] registration upload failed", e);
    }
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.warn("[push] registration error", err);
  });
}
