import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, tint } from '../theme/tokens';
import { text } from '../theme/typography';
import type { JobType } from '../data/contracts';

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
