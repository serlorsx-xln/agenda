/**
 * Agenda brand palette — single source for colors outside CSS (OG images, email).
 * Web UI tokens live in globals.css; keep hex values aligned with those HSL channels.
 */
export const brand = {
  /** Deep teal — primary CTA, logo mark, links */
  primary: {
    hsl: "172 42% 36%",
    hex: "#358F7A",
    hexHover: "#2D7866",
    hexDark: "#52A894",
  },
  /** Soft teal wash — highlights, selected rows, trial banners */
  primarySoft: {
    hsl: "172 35% 95%",
    hex: "#EEF6F4",
    hexDark: "#152622",
  },
  /** Neutral surfaces (unchanged from design system) */
  neutral: {
    foreground: "#141416",
    foregroundMuted: "#71717a",
    body: "#52525b",
    border: "#e4e4e7",
    surface: "#f4f4f5",
    background: "#ffffff",
    onPrimary: "#FAFAFA",
  },
  /** Semantic — distinct from brand primary */
  success: {
    hex: "#278A45",
  },
} as const;
