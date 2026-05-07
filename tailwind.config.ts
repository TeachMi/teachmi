import type { Config } from "tailwindcss";

const config = {
  theme: {
    extend: {
      colors: {
        primary: "#003527",
        "primary-container": "#064e3b",
        "primary-fixed": "#b0f0d6",
        "primary-fixed-dim": "#95d3ba",
        "on-primary": "#ffffff",
        "on-primary-container": "#80bea6",
        secondary: "#5e5e5b",
        "tertiary-fixed": "#ffdea5",
        "tertiary-accent": "#d4af37",
        "on-tertiary-fixed": "#261900",
        "on-tertiary-fixed-variant": "#5d4201",
        surface: "#fcf9f8",
        "surface-low": "#f6f3f2",
        "surface-container": "#f0eded",
        "surface-high": "#eae7e7",
        "surface-lowest": "#ffffff",
        linen: "#f9f7f2",
        "linen-border": "#e5e1d8",
        outline: "#707974",
        "on-surface": "#1b1c1c",
        "on-surface-variant": "#404944",
        danger: "#dc2626",
        success: "#059669",
        warning: "#d97706",
        admin: "#7c2d12",
      },
      fontFamily: {
        body: ["var(--font-heebo)", "Arial", "Helvetica", "sans-serif"],
        display: ["var(--font-assistant)", "Arial", "Helvetica", "sans-serif"],
      },
    },
  },
} satisfies Config;

export default config;
