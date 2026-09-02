import type { ViewStyle } from 'react-native';
import { colors } from './tokens';

/**
 * --shadow-sm / --shadow-md / --shadow-lg translated to RN (§1.1).
 *
 * CSS `blur` is a Gaussian diameter; iOS `shadowRadius` is roughly its radius,
 * so blur/2 is the closest match. `elevation` tracks the CSS y-offset, which is
 * how Android's shadow model reads visually.
 */

const ink = colors.navyDeep; // rgba(15,30,46,…) in every gallery shadow

/**
 * `--shadow-sm: 0 1px 2px rgba(15,30,46,.06), 0 0 0 1px var(--hairline)`
 * The second layer is a 1px ring, not a shadow — it is applied as a real border
 * so it renders identically on both platforms.
 */
export const shadowSm: ViewStyle = {
  shadowColor: ink,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 1,
  elevation: 1,
  borderWidth: 1,
  borderColor: colors.hairline,
};

/** `--shadow-md: 0 6px 20px rgba(15,30,46,.10)` — raised */
export const shadowMd: ViewStyle = {
  shadowColor: ink,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.1,
  shadowRadius: 10,
  elevation: 6,
};

/** `--shadow-lg: 0 16px 44px rgba(15,30,46,.16)` — modals, sheets */
export const shadowLg: ViewStyle = {
  shadowColor: ink,
  shadowOffset: { width: 0, height: 16 },
  shadowOpacity: 0.16,
  shadowRadius: 22,
  elevation: 16,
};

/** `.sheet: 0 -12px 40px rgba(15,30,46,.18)` — bottom sheet, shadow casts up */
export const shadowSheet: ViewStyle = {
  shadowColor: ink,
  shadowOffset: { width: 0, height: -12 },
  shadowOpacity: 0.18,
  shadowRadius: 20,
  elevation: 20,
};

/** `.btn: 0 1px 3px rgba(15,30,46,.12)` — every button's base lift */
export const shadowButton: ViewStyle = {
  shadowColor: ink,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.12,
  shadowRadius: 1.5,
  elevation: 2,
};

/** `.btn-primary: 0 2px 8px rgba(22,50,79,.24)` */
export const shadowButtonPrimary: ViewStyle = {
  shadowColor: colors.navy,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.24,
  shadowRadius: 4,
  elevation: 3,
};

/** `.btn-amber: 0 2px 8px rgba(245,166,35,.30)` */
export const shadowButtonAmber: ViewStyle = {
  shadowColor: colors.amber,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.3,
  shadowRadius: 4,
  elevation: 3,
};

/** `.btn-danger: 0 2px 8px rgba(220,38,38,.26)` */
export const shadowButtonDanger: ViewStyle = {
  shadowColor: colors.stOverdue,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.26,
  shadowRadius: 4,
  elevation: 3,
};
