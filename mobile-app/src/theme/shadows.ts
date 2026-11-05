import type { ViewStyle } from 'react-native';
import { colors } from './tokens';

const ink = colors.navyDeep;

export const shadowSm: ViewStyle = {
  shadowColor: ink,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 1,
  elevation: 1,
  borderWidth: 1,
  borderColor: colors.hairline,
};

export const shadowMd: ViewStyle = {
  shadowColor: ink,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.1,
  shadowRadius: 10,
  elevation: 6,
};

export const shadowLg: ViewStyle = {
  shadowColor: ink,
  shadowOffset: { width: 0, height: 16 },
  shadowOpacity: 0.16,
  shadowRadius: 22,
  elevation: 16,
};

export const shadowSheet: ViewStyle = {
  shadowColor: ink,
  shadowOffset: { width: 0, height: -12 },
  shadowOpacity: 0.18,
  shadowRadius: 20,
  elevation: 20,
};

export const shadowButton: ViewStyle = {
  shadowColor: ink,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.12,
  shadowRadius: 1.5,
  elevation: 2,
};

export const shadowButtonPrimary: ViewStyle = {
  shadowColor: colors.navy,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.24,
  shadowRadius: 4,
  elevation: 3,
};

export const shadowButtonAmber: ViewStyle = {
  shadowColor: colors.amber,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.3,
  shadowRadius: 4,
  elevation: 3,
};

export const shadowButtonDanger: ViewStyle = {
  shadowColor: colors.stOverdue,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.26,
  shadowRadius: 4,
  elevation: 3,
};
