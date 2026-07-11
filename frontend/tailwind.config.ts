import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ─── Brand (N&K DentalSoft accent #1E88E5) ────────────
        brand: {
          50: "#E3F2FD",
          100: "#BBDEFB",
          200: "#90CAF9",
          300: "#64B5F6",
          400: "#42A5F5",
          500: "#1E88E5",
          600: "#1976D2",
          700: "#1565C0",
          800: "#0D47A1",
          900: "#0A3A82",
          950: "#062A66",
        },
        // ─── Accent / success (N&K #43A047) ──────────────────
        accent: {
          50: "#E8F5E9",
          100: "#C8E6C9",
          200: "#A5D6A7",
          300: "#81C784",
          400: "#66BB6A",
          500: "#43A047",
          600: "#388E3C",
          700: "#2E7D32",
          800: "#1B5E20",
          900: "#14532d",
        },
        // ─── Semantic tokens ──────────────────────────────────
        success: {
          50: "#E8F5E9", 100: "#C8E6C9", 200: "#A5D6A7",
          300: "#81C784", 400: "#66BB6A", 500: "#43A047",
          600: "#388E3C", 700: "#2E7D32", 800: "#1B5E20", 900: "#14532d",
        },
        warning: {
          50: "#FFF3E0", 100: "#FFE0B2", 200: "#FFCC80",
          300: "#FFB74D", 400: "#FFA726", 500: "#FB8C00",
          600: "#F57C00", 700: "#EF6C00", 800: "#E65100", 900: "#BF360C",
        },
        danger: {
          50: "#FFEBEE", 100: "#FFCDD2", 200: "#EF9A9A",
          300: "#E57373", 400: "#EF5350", 500: "#E53935",
          600: "#D32F2F", 700: "#C62828", 800: "#B71C1C", 900: "#7F1D1D",
        },
        info: {
          50: "#E3F2FD", 100: "#BBDEFB", 200: "#90CAF9",
          300: "#64B5F6", 400: "#42A5F5", 500: "#1E88E5",
          600: "#1976D2", 700: "#1565C0", 800: "#0D47A1", 900: "#0A3A82",
        },
        // ─── Surface / neutral ───────────────────────────────
        surface: {
          DEFAULT: "#ffffff",
          muted: "#F8FAFC",
          subtle: "#F1F5F9",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      fontSize: {
        "page-title": [
          "1.75rem",
          { lineHeight: "2.5rem", fontWeight: "700", letterSpacing: "0.01em" },
        ],
        "section-title": [
          "1.125rem",
          { lineHeight: "1.75rem", fontWeight: "600", letterSpacing: "0.01em" },
        ],
        "label": ["0.75rem", { lineHeight: "1rem", fontWeight: "600", letterSpacing: "0.02em" }],
        "data": ["0.875rem", { lineHeight: "1.4rem", letterSpacing: "0.01em" }],
        "help": ["0.75rem", { lineHeight: "1.15rem", letterSpacing: "0.01em" }],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        card: "0.75rem",
        pill: "9999px",
      },
      boxShadow: {
        card: "0 2px 4px -1px rgba(0,0,0,0.02)",
        "card-hover": "0 4px 6px -2px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.02)",
        dropdown: "0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        DEFAULT: "220ms",
      },
    },
  },
  plugins: [],
};
export default config;
