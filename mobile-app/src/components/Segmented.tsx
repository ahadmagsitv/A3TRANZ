import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/tokens';
import { tabular, text } from '../theme/typography';

export interface SegmentedOption {
  key: string;
  label: string;
  /** `.seg b .n` — the count is tabular and only renders when > 0. */
  count?: number;
}

/** `.seg` — M4/M5/M6's three job lists and M24's two earnings tabs. */
export const Segmented = memo(function Segmented({
  options,
  value,
  onChange,
}: {
  options: SegmentedOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.seg}>
      {options.map(option => {
        const on = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={
              option.count === undefined
                ? option.label
                : `${option.label}, ${option.count}`
            }
            onPress={() => onChange(option.key)}
            /* The design's segment is ~34pt tall; hitSlop takes the TOUCH
               target past 44pt without changing a single rendered pixel. */
            hitSlop={{ top: 6, bottom: 6 }}
            style={[styles.item, on ? styles.itemOn : null]}
          >
            <Text
              numberOfLines={1}
              style={[styles.label, on ? styles.labelOn : null]}
            >
              {option.label}
              {option.count ? (
                <Text
                  style={[styles.label, on ? styles.labelOn : null, tabular]}
                >
                  {'  '}
                  {option.count}
                </Text>
              ) : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  seg: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: colors.surface3,
    borderRadius: 9,
    padding: 2,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 7,
  },
  itemOn: {
    backgroundColor: colors.surface,
    shadowColor: colors.navyDeep,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  label: { ...text(600, 13), color: colors.text2 },
  labelOn: { color: colors.text },
});
