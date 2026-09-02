import type { TextStyle } from 'react-native';

/**
 * Type system — IMPLEMENTATION_PLAN §1.3, §8 Q3 (resolved).
 *
 * Inter + Outfit are BUNDLED for both iOS and Android so mobile matches
 * admin-web exactly. `--f` (body) = Inter, `--fd` (display) = Outfit.
 *
 * RN resolves a font by PostScript name (iOS) / asset filename (Android), NOT
 * by family + numeric weight. Every file in assets/fonts/ has a PostScript name
 * identical to its filename, so one string works on both platforms. Always pass
 * a family from `fonts` and never set `fontWeight` alongside it — doing so makes
 * Android synthesise a fake bold on top of an already-bold face.
 */
export const fonts = {
  /** --f · Inter — body, labels, all UI copy */
  text: {
    400: 'Inter-Regular',
    500: 'Inter-Medium',
    600: 'Inter-SemiBold',
    700: 'Inter-Bold',
  },
  /** --fd · Outfit — titles, numbers, money */
  display: {
    500: 'Outfit-Medium',
    600: 'Outfit-SemiBold',
    700: 'Outfit-Bold',
    800: 'Outfit-ExtraBold',
    900: 'Outfit-Black',
  },
} as const;

export type TextWeight = keyof typeof fonts.text;
export type DisplayWeight = keyof typeof fonts.display;

/** `font: 600 15px var(--f)` → `text(600, 15)` */
export const text = (
  weight: TextWeight,
  fontSize: number,
  letterSpacing?: number,
): TextStyle => ({
  fontFamily: fonts.text[weight],
  fontSize,
  ...(letterSpacing === undefined ? null : { letterSpacing }),
});

/** `font: 800 20px var(--fd)` → `display(800, 20, -0.3)` */
export const display = (
  weight: DisplayWeight,
  fontSize: number,
  letterSpacing?: number,
): TextStyle => ({
  fontFamily: fonts.display[weight],
  fontSize,
  ...(letterSpacing === undefined ? null : { letterSpacing }),
});

/**
 * `font-variant-numeric: tabular-nums` (§1.3).
 * Spread onto EVERY number: money, job IDs, unit IDs, container numbers,
 * timestamps and counts.
 *
 * ponytail: `fontVariant` is honoured on iOS and on Android from RN 0.73's
 * font-feature support. Inter and Outfit both ship `tnum`, so this is a real
 * feature toggle, not a fallback. If a future Android build renders
 * proportional figures, swap the family for a tabular-by-default face rather
 * than hand-padding digits.
 */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
