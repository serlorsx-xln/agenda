import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1200px",
      },
    },
    extend: {
      fontFamily: {
        sans: [
          "var(--font-line-seed)",
          "LINE Seed Sans",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      // Strict type scale. Tuple = [size, { lineHeight, letterSpacing }].
      fontSize: {
        caption: ["0.75rem", { lineHeight: "1rem" }],
        small: ["0.8125rem", { lineHeight: "1.25rem" }],
        body: ["0.9375rem", { lineHeight: "1.5rem" }],
        "body-lg": ["1rem", { lineHeight: "1.6rem" }],
        h3: ["1.125rem", { lineHeight: "1.6rem", letterSpacing: "-0.01em" }],
        h2: ["1.375rem", { lineHeight: "1.85rem", letterSpacing: "-0.01em" }],
        h1: ["1.75rem", { lineHeight: "2.15rem", letterSpacing: "-0.02em" }],
        display: ["2.25rem", { lineHeight: "2.6rem", letterSpacing: "-0.02em" }],
        "display-lg": [
          "2.75rem",
          { lineHeight: "3.05rem", letterSpacing: "-0.025em" },
        ],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
