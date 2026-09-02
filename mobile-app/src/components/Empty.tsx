import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, iconSize } from '../theme/tokens';
import { display, text } from '../theme/typography';

/**
 * `.empty` / `.ec` — one component, per-screen copy (§8 Q7).
 * In Progress and Completed have no designed empty frame; they reuse this with
 * different copy rather than inventing a second visual.
 */
export const Empty = memo(function Empty({
  icon: Icon,
  title,
  body,
  action,
  actionMarginTop = 14,
  circleColor,
  iconColor,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  /** e.g. a "clear filters" or "create" CTA. */
  action?: React.ReactNode;
  /**
   * On top of the wrapper's 6px gap. M3-link-sent writes 14; M23-submitted
   * writes 12 total, so it passes 6. One number, two frames, no fork.
   */
  actionMarginTop?: number;
  /**
   * `.ec` defaults to `--surface-3` / `--muted`. `M3-link-sent` overrides both
   * inline (`--ok-bg` / `--st-done`) — that is a success state wearing the
   * empty-state layout, so it tints rather than forking the component.
   */
  circleColor?: string;
  iconColor?: string;
}) {
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.circle,
          circleColor ? { backgroundColor: circleColor } : null,
        ]}
      >
        <Icon
          size={iconSize.empty}
          color={iconColor ?? colors.muted}
          strokeWidth={2}
        />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {action ? (
        <View style={[styles.action, { marginTop: actionMarginTop }]}>
          {action}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: 40,
    gap: 6,
  },
  circle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { ...display(800, 18), color: colors.text, textAlign: 'center' },
  body: {
    ...text(500, 14),
    color: colors.text2,
    maxWidth: 220,
    textAlign: 'center',
  },
  action: { alignSelf: 'stretch', alignItems: 'center' },
});
