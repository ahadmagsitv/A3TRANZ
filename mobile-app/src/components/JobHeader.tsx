import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/tokens';
import { display, tabular, text } from '../theme/typography';
import { JobTypeChip } from './JobTypeChip';
import type { JobType } from '../data/contracts';

/**
 * The identity block every capture frame repeats verbatim (M19–M22):
 * `.jtype` chip + right-aligned `.bignum` job id, then `.h-lbl` at the frames'
 * inline 19px override, then `.sub`.
 */
export const JobHeader = memo(function JobHeader({
  id,
  type,
  title,
  customerName,
}: {
  id: string;
  type: JobType;
  title: string;
  customerName: string;
}) {
  return (
    <>
      <View style={styles.chips}>
        <JobTypeChip type={type} />
        <Text style={styles.id}>#{id}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{customerName}</Text>
    </>
  );
});

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  id: { ...text(600, 12), ...tabular, color: colors.text2, marginLeft: 'auto' },
  // `.h-lbl` is Outfit 800/22; every capture frame overrides it inline to 19px.
  title: { ...display(800, 19, -0.4), color: colors.text },
  sub: { ...text(500, 14), color: colors.text2, marginBottom: 14 },
});
