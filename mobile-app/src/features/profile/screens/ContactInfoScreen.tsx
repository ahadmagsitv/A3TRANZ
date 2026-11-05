import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Building2, CheckCircle2, Flag, Mail, User } from 'lucide-react-native';
import { Button, Row, Toast, Topbar } from '../../../components';
import { driversRepo } from '../../../data/repos';
import type { Driver } from '../../../data/contracts';
import { useAsync } from '../../../hooks/useAsync';
import { colors, radii, spacing } from '../../../theme/tokens';
import type { AppStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'ContactInfo'>;

export const ContactInfoScreen = ({ navigation }: Props): React.JSX.Element => {
  const { data, error, reload } = useAsync<Driver>(
    () => driversRepo.me(),
    [],
  );
  const back = useCallback(() => navigation.goBack(), [navigation]);

  return (
    <View style={styles.screen}>
      <Topbar title="Contact info" onBack={back} />

      {error ? (
        <View style={styles.pad}>
          <Toast tone="err" message={error} />
          <Button
            label="Try again"
            variant="secondary"
            onPress={reload}
            block
            style={styles.retry}
          />
        </View>
      ) : !data ? (
        <View style={styles.flex} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrl}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Row icon={User} title="Name" subtitle={data.name} />
            <Row icon={Mail} title="Email" subtitle={data.email} />
            <Row icon={Flag} title="Role" subtitle={data.role} />
            <Row icon={Building2} title="Base" subtitle={data.base} last />
          </View>

          {data.active ? (
            <View style={styles.active}>
              <CheckCircle2 size={14} color={colors.stDoneInk} strokeWidth={2.2} />
              <Text style={styles.activeText}>Active driver</Text>
            </View>
          ) : null}

          <Text style={styles.note}>
            These details are set by your dispatcher. Contact your office to
            update them.
          </Text>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pad: { paddingHorizontal: spacing.screenH, paddingTop: 14 },
  retry: { marginTop: 12 },
  scrl: {
    paddingTop: 20,
    paddingHorizontal: spacing.screenH,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.r2,
    overflow: 'hidden',
  },
  active: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 16,
  },
  activeText: { fontSize: 12, fontWeight: '600', color: colors.stDoneInk },
  note: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.text2,
    marginTop: 14,
  },
});
