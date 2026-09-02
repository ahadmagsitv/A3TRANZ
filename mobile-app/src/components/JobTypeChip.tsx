import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, tint } from '../theme/tokens';
import { text } from '../theme/typography';
import type { JobType } from '../data/contracts';

/**
 * `.jtype` — Import / Export only.
 *
 * `.jtype.emt` (empty pickup) is DEFERRED (§4, §11.1). The style survives in
 * tokens for restorability but this component RETURNS NULL for it: an empty
 * chip must never reach the screen. QA gate §7 check #4 greps for it.
 */
export const JobTypeChip = memo(function JobTypeChip({
  type,
}: {
  type: JobType;
}) {
  if (type === 'empty') {
    return null;
  }
  const isImport = type === 'import';
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: isImport ? tint.jtypeImp.bg : tint.jtypeExp.bg,
          borderColor: isImport ? tint.jtypeImp.border : tint.jtypeExp.border,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: isImport ? colors.stProgressInk : colors.navy },
        ]}
      >
        {isImport ? 'IMPORT' : 'EXPORT'}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: { ...text(700, 10, 0.4) },
});
