import type { TextStyle } from 'react-native';

export const fonts = {
  text: {
    400: 'Inter-Regular',
    500: 'Inter-Medium',
    600: 'Inter-SemiBold',
    700: 'Inter-Bold',
  },
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

export const text = (
  weight: TextWeight,
  fontSize: number,
  letterSpacing?: number,
): TextStyle => ({
  fontFamily: fonts.text[weight],
  fontSize,
  ...(letterSpacing === undefined ? null : { letterSpacing }),
});

export const display = (
  weight: DisplayWeight,
  fontSize: number,
  letterSpacing?: number,
): TextStyle => ({
  fontFamily: fonts.display[weight],
  fontSize,
  ...(letterSpacing === undefined ? null : { letterSpacing }),
});

export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
