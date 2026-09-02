import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Banknote,
  Briefcase,
  CheckCircle2,
  Flag,
  MessageSquare,
  RefreshCw,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { Button, Row, Toast, Topbar } from '../../../components';
import { notificationsRepo } from '../../../data/repos';
import type { NotificationKind, NotificationPrefs } from '../../../data/contracts';
import { useAsync } from '../../../hooks/useAsync';
import { colors, radii, spacing } from '../../../theme/tokens';
import type { AppStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'NotificationSettings'>;

/**
 * No `M14` row goes anywhere either — same gap as Contact info. Built now
 * that it's been asked for, one switch per §6.8 driver trigger (the same
 * seven kinds `NotificationsScreen`/M14 lists), each backed by a real
 * `NotificationsRepo.setPref` write, not local-only screen state — a toggle
 * that resets on app restart wouldn't be a setting.
 */
const ORDER: { kind: NotificationKind; label: string; icon: LucideIcon }[] = [
  { kind: 'job_assigned', label: 'Job assigned', icon: Briefcase },
  { kind: 'job_updated', label: 'Job updated', icon: RefreshCw },
  { kind: 'message', label: 'New message', icon: MessageSquare },
  { kind: 'overdue', label: 'Overdue job reminder', icon: Flag },
  { kind: 'approved', label: 'Closeout approved', icon: CheckCircle2 },
  { kind: 'period_paid', label: 'Pay period paid', icon: Banknote },
  { kind: 'unit_out_of_service', label: 'Unit taken out of service', icon: Wrench },
];

export const NotificationSettingsScreen = ({
  navigation,
}: Props): React.JSX.Element => {
  const { data, error, reload } = useAsync<NotificationPrefs>(
    () => notificationsRepo.getPrefs(),
    [],
  );
  const back = useCallback(() => navigation.goBack(), [navigation]);

  // Editable overlay on the fetched prefs (JobChatScreen's pattern for
  // async-load-then-locally-mutate): `data` refetches on focus, `prefs` is
  // what the switches actually render and mutate.
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  useEffect(() => setPrefs(data), [data]);

  const toggle = useCallback((kind: NotificationKind, enabled: boolean) => {
    // Optimistic: a switch that waits 200-400ms to move reads as broken.
    setPrefs(prev => (prev ? { ...prev, [kind]: enabled } : prev));
    notificationsRepo.setPref(kind, enabled).catch(() => {
      setPrefs(prev => (prev ? { ...prev, [kind]: !enabled } : prev));
    });
  }, []);

  return (
    <View style={styles.screen}>
      <Topbar title="Notification settings" onBack={back} />

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
      ) : !prefs ? (
        <View style={styles.flex} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrl}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            {ORDER.map(({ kind, label, icon }, i) => (
              <Row
                key={kind}
                icon={icon}
                title={label}
                last={i === ORDER.length - 1}
                right={
                  <Switch
                    value={prefs[kind]}
                    onValueChange={v => toggle(kind, v)}
                    trackColor={{ false: colors.border, true: colors.sel }}
                  />
                }
              />
            ))}
          </View>
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
});
