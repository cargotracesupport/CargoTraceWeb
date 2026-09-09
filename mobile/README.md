# Goodswala Driver — Android shell (background location)

A thin [Capacitor](https://capacitorjs.com) Android app that wraps the **existing
deployed Goodswala web app** and adds a **native background-location service**.
It exists to solve the one thing a website can't do: keep a driver's GPS
streaming when they switch to Google Maps or lock the screen.

## How it works

- The app loads the live site from `server.url` in [`capacitor.config.ts`](./capacitor.config.ts)
  — it does **not** bundle its own copy of the app. Deploy the web app as usual
  and the shell picks up the changes; you rarely rebuild the APK.
- The web app already knows how to use the background plugin: the driver screen
  calls [`src/lib/driverGeo.ts`](../src/lib/driverGeo.ts), which detects the
  native shell at runtime (`window.Capacitor`) and uses
  `@capacitor-community/background-geolocation` instead of the browser's
  Geolocation API. Every fix is POSTed to the same `/api/track` endpoint with the
  driver's normal session — no separate auth.
- In a plain browser there's **no change** — `driverGeo.ts` falls back to the
  standard Geolocation API (foreground only). One codebase, two behaviours.

## Prerequisites

- Node 18+
- **Android Studio** (includes the Android SDK + an emulator)
- JDK 17

## One-time setup

```bash
cd mobile
npm install
npx cap add android      # generates the native android/ project
npx cap sync             # copies config + installs native plugins
```

Set your production URL in [`capacitor.config.ts`](./capacitor.config.ts)
(`server.url`). For testing against a local `npm run dev` on a real phone, use
your machine's LAN URL (e.g. `http://192.168.1.10:3000`) and set
`cleartext: true`.

## Android permissions

`npx cap sync` pulls in most of what the plugin needs. Confirm these are in
`android/app/src/main/AndroidManifest.xml` (the plugin adds them; add any that
are missing):

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Android 10+ requires the user to pick **"Allow all the time"** for background
location — the app prompts for this the first time a trip starts.

## Build & run

```bash
npx cap open android     # opens the project in Android Studio
```

Then in Android Studio: pick a device/emulator and **Run**, or
**Build → Build APK(s)** to produce an installable `.apk`
(`android/app/build/outputs/apk/`). For the Play Store, use
**Build → Generate Signed Bundle / APK** (an `.aab`).

## Test the background behaviour

1. Install the APK on a phone and open it → the Goodswala login loads.
2. Log in as a **driver**, open an assigned delivery, tap **Start trip**, and
   grant **"Allow all the time"** location.
3. The GPS pill shows **"Live GPS · background"** and a persistent notification
   appears ("Goodswala is tracking your delivery").
4. Switch to Google Maps / lock the screen for a few minutes.
5. On the admin/agent dispatch map, the driver keeps moving — no more freeze.

## Notes

- **iOS** is possible too (`npx cap add ios`, needs a Mac + Apple Developer
  account). The same `driverGeo.ts` code works; iOS uses its own background
  location mode.
- **Play Store review:** apps that use `ACCESS_BACKGROUND_LOCATION` must declare
  and justify it in the Play Console (a short form + a demo video). Budget a day
  for the review.
- Only the **driver** app needs this shell. Admin / agent / customer keep using
  the normal website.
