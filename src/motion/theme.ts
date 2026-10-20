// Shared visual tokens for the learning motion graphics (Remotion compositions).
export const C = {
  sky50: "#F3F9FE",
  sky100: "#E6F3FC",
  sky200: "#CDE7F9",
  sky300: "#A9D6F5",
  sky400: "#7EC1EE",
  sky500: "#4FA8E6",
  sky600: "#2F8FD6",
  ink: "#1F3550",
  ink2: "#4A5D75",
  muted: "#8496AB",
  lavender: "#EEEAFB",
  lavenderInk: "#7C6BD6",
  pink: "#FDEEF3",
  pinkInk: "#E0709A",
  mint: "#E3F6EF",
  mintInk: "#2FA57D",
  cream: "#FFF5DF",
  creamInk: "#D9962A",
  white: "#FFFFFF",
} as const;

export type Tone = "sky" | "lavender" | "pink" | "mint" | "cream";

export const TONES: Record<Tone, { bg: string; ink: string }> = {
  sky: { bg: C.sky100, ink: C.sky600 },
  lavender: { bg: C.lavender, ink: C.lavenderInk },
  pink: { bg: C.pink, ink: C.pinkInk },
  mint: { bg: C.mint, ink: C.mintInk },
  cream: { bg: C.cream, ink: C.creamInk },
};

export const FONT =
  "'Noto Sans SC', 'Noto Sans KR', 'PingFang SC', 'Malgun Gothic', system-ui, sans-serif";

export const FPS = 30;

/** Width of every overlay composition. Heights vary per overlay. */
export const OVERLAY_WIDTH = 600;
