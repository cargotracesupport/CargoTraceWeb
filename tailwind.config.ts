import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#07090d",
        s1: "#0d1118",
        s2: "#111822",
        s3: "#162030",
        border: "#1a2a38",
        border2: "#1f3245",
        green: "#00e676",
        amber: "#ffb74d",
        red: "#ff5252",
        blue: "#40c4ff",
        text: "#dde6ef",
        muted: "#3d5466",
        muted2: "#6a8a9e",
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        mono: [
          "var(--font-dm-mono)",
          "DM Mono",
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
