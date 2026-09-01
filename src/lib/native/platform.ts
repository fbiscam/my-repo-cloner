import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();
export const nativePlatform = () => Capacitor.getPlatform(); // "ios" | "android" | "web"
export const isIOS = () => Capacitor.getPlatform() === "ios";
export const isAndroid = () => Capacitor.getPlatform() === "android";
