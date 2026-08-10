import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("--c-bg"),
        s1: v("--c-s1"),
        s2: v("--c-s2"),
        s3: v("--c-s3"),
        border: v("--c-border"),
        border2: v("--c-border2"),
        primary: v("--c-primary"),
        primary2: v("--c-primary-2"),
        accent: v("--c-accent"),
        green: v("--c-green"),
        amber: v("--c-amber"),
        red: v("--c-red"),
        blue: v("--c-blue"),
        text: v("--c-text"),
        muted: v("--c-muted"),
        muted2: v("--c-muted2"),
        "on-accent": v("--c-on-accent"),
      },
      fontFamily: {
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
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
