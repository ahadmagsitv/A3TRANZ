import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Container, Truck } from 'lucide-react-native';
import { colors, radii, tint } from '../theme/tokens';
import { tabular, text } from '../theme/typography';
import type { UnitKind } from '../data/contracts';

/** `.unitchip` / `.unitchip.oos` — `TRK-118`, `CH-4402`. */
export const UnitChip = memo(function UnitChip({
  id,
  kind,
  outOfService = false,
}: {
  id: string;
  kind: UnitKind;
  outOfService?: boolean;
}) {
  const ink = outOfService ? colors.stOverdueInk : colors.navy;
  const Glyph = kind === 'truck' ? Truck : Container;
  return (
    <View
      style={[
        styles.chip,
        outOfService
          ? {
              backgroundColor: tint.unitOos.bg,
              borderColor: tint.unitOos.border,
            }
          : { backgroundColor: colors.navyGlass, borderColor: colors.navyLine },
      ]}
    >
      <Glyph size={14} color={ink} strokeWidth={2} />
      <Text style={[styles.label, { color: ink }]}>{id}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: { ...text(700, 12), ...tabular },
});
