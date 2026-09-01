import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNative } from "./platform";

export async function tapHaptic() {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {}
}

export async function signalHaptic() {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {}
}

export async function successHaptic() {
  if (!isNative()) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {}
}
