import React, { memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, iconSize, radii } from '../theme/tokens';
import { text } from '../theme/typography';
import { shadowSm } from '../theme/shadows';
import { STEP_LABELS, stepOrder } from '../data/jobStateMachine';
import type { JobStep, JobType } from '../data/contracts';

export const Stepper = memo(function Stepper({
  current,
  type,
  allDone = false,
  compact = false,
  style,
}: {
  current: JobStep;
  type: JobType;
  allDone?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const order = stepOrder(type);
  const currentIndex = order.indexOf(current);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${currentIndex + 1} of ${order.length}: ${
        STEP_LABELS[current]
      }`}
      style={[styles.stepper, compact ? styles.compact : null, style]}
    >
      {order.map((step, i) => {
        const done = allDone || i < currentIndex;
        const on = !allDone && i === currentIndex;
        return (
          <View key={step} style={styles.step}>
            {i > 0 ? (
              <View
                style={[
                  styles.connector,
                  done || on ? styles.connectorDone : null,
                ]}
              />
            ) : null}
            <View
              style={[
                styles.dot,
                done ? styles.dotDone : null,
                on ? styles.dotOn : null,
              ]}
            >
              {done ? (
                <Check
                  size={iconSize.step}
                  color={colors.onNavy}
                  strokeWidth={3}
                />
              ) : null}
            </View>
            <Text style={[styles.label, on ? styles.labelOn : null]}>
              {STEP_LABELS[step]}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.r2,
    paddingTop: 15,
    paddingHorizontal: 8,
    paddingBottom: 12,
    ...shadowSm,
  },
  compact: { paddingTop: 12, paddingHorizontal: 6, paddingBottom: 10 },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  connector: {
    position: 'absolute',
    top: 10,
    right: '50%',
    width: '100%',
    height: 2,
    backgroundColor: colors.hairline,
  },
  connectorDone: { backgroundColor: colors.stDone },
  dot: {
    zIndex: 1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.stDone, borderColor: colors.stDone },
  dotOn: { borderColor: colors.stProgress, borderWidth: 6 },
  label: { ...text(600, 11), color: colors.text2, textAlign: 'center' },
  labelOn: { ...text(700, 11), color: colors.stProgressInk },
});
