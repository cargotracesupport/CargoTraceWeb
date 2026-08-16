import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor Android shell for the CargoTrace *driver* app. Its only job is to
// wrap the existing deployed web app in a native container that can run the
// background-location foreground service — so a driver's GPS keeps streaming to
// /api/track even when they switch to Google Maps or lock the screen.
//
// The shell loads the LIVE deployed site via `server.url` (no web assets are
// bundled), so it rarely needs rebuilding — deploy the web app as usual and the
// shell picks up the changes. `webDir` still has to point at a folder that
// exists (Capacitor requirement); the placeholder in ./www is only shown if the
// live URL can't be reached.
const config: CapacitorConfig = {
  appId: "com.cargotrace.driver",
  appName: "CargoTrace Driver",
  webDir: "www",
  server: {
    // 👉 Set this to your production URL (or a LAN URL like http://192.168.1.10:3000
    // while testing on a real device against `npm run dev`; then also set
    // `cleartext: true` for plain http).
    url: "https://cargo-trace-web.vercel.app",
    cleartext: false,
  },
};

export default config;
