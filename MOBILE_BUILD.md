# JENVU AI — Mobile Build Guide (iOS + Android)

The web app is wrapped with **Capacitor 6** to ship as a native iOS and Android app. The web code (everything under `src/`) is the single source of truth — the native shell just hosts it.

---

## 1. One-time setup on your machine

You can't build iOS/Android binaries from the Lovable sandbox — Apple and Google require their own tools on your laptop.

**You need:**
- **Node.js 20+** and **npm** (or bun)
- **For iOS:** a Mac with **Xcode 15+**, an Apple Developer account ($99/yr), and CocoaPods (`sudo gem install cocoapods`)
- **For Android:** **Android Studio** (latest), JDK 17, Google Play Console account ($25 one-time)

**Clone & install:**
```bash
git clone <your-lovable-repo-url> jenvu-ai
cd jenvu-ai
npm install
```

---

## 2. Add the native projects (run once)

```bash
npm run build           # produces dist/
npx cap add ios
npx cap add android
```

This creates `ios/` and `android/` folders in the project. Commit them.

---

## 3. Day-to-day workflow

After any web change:

```bash
npm run cap:sync        # builds dist/ and copies it into ios/ + android/
```

Then open the native project:

```bash
npm run cap:ios         # opens Xcode
npm run cap:android     # opens Android Studio
```

---

## 4. Live-reload while developing (optional)

Run the app on your phone but have it load the live `jenvu.com` site, so every web change appears instantly without rebuilding:

```bash
CAP_SERVER_URL=https://jenvu.com npx cap sync
npm run cap:ios       # or cap:android
```

Remove `CAP_SERVER_URL` before building for the store.

---

## 5. App icon & splash screen

Drop a 1024×1024 PNG at `resources/icon.png` and a 2732×2732 PNG at `resources/splash.png`, then:

```bash
npm i -D @capacitor/assets
npx capacitor-assets generate
```

This auto-generates every iOS and Android icon + splash size.

---

## 6. Push notifications (signal alerts)

1. **iOS:** in Apple Developer portal, create an **APNs Auth Key** (.p8). In Xcode → Signing & Capabilities, add **Push Notifications** and **Background Modes → Remote notifications**.
2. **Android:** create a Firebase project, add the Android app (package `com.jenvu.ai`), download `google-services.json` into `android/app/`.
3. Back in Lovable, paste these as project secrets when prompted:
   - `FCM_SERVICE_ACCOUNT_JSON` — full service account JSON from Firebase Console → Project Settings → Service accounts → Generate new private key
   - `APNS_KEY_P8` — contents of the .p8 file
   - `APNS_KEY_ID` — 10-char key ID
   - `APNS_TEAM_ID` — your Apple Team ID

The app calls `registerPushNotifications(userId)` after login (see `src/lib/native/push.ts`); the token is posted to `/api/public/push-register` for the backend to use when an A+ signal fires.

---

## 7. Submitting to the stores

**iOS (App Store):**
1. In Xcode: Product → Archive
2. Window → Organizer → Distribute App → App Store Connect
3. In App Store Connect, fill metadata, screenshots (6.7" + 6.1"), and the privacy questionnaire
4. **Important:** add a Disclaimer screen on first launch (the `/disclaimer` page content) — Apple rejects trading apps without one

**Android (Play Store):**
1. In Android Studio: Build → Generate Signed Bundle / APK → Android App Bundle
2. Create a keystore (keep it safe — losing it = losing the ability to update the app)
3. Upload `.aab` to Play Console → Production
4. Fill content rating, target audience, data safety, and screenshots

---

## 8. Bundle IDs

| Platform | ID |
|---|---|
| iOS | `com.jenvu.ai` |
| Android | `com.jenvu.ai` |

Change both in `capacitor.config.ts` only if you rebrand — then re-run `npx cap sync`.

---

## Troubleshooting

- **Blank white screen on device:** make sure `vite.config.ts` has `base: './'` (Capacitor loads via `file://`).
- **Mic not working on iOS:** ensure `NSMicrophoneUsageDescription` is set in `ios/App/App/Info.plist`.
- **Push not arriving:** check device logs via `npx cap run ios -l` or `adb logcat`.
- **Live-reload not loading:** confirm `CAP_SERVER_URL` was set during `cap sync`, and the device is online.
