import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlertTriangle,
  Banknote,
  BellOff,
  Briefcase,
  CheckCheck,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react-native';
import {
  Button,
  Empty,
  Row,
  SectionLabel,
  Toast,
  Topbar,
} from '../../../components';
import { notificationsRepo } from '../../../data/repos';
import type {
  AppNotification,
  NotificationKind,
} from '../../../data/contracts';
import { useAsync } from '../../../hooks/useAsync';
import { chrome, colors, iconSize, radii, tint } from '../../../theme/tokens';
import type {
  AppStackParamList,
  TabParamList,
} from '../../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Alerts'>,
  NativeStackScreenProps<AppStackParamList>
>;

/**
 * The `.row-ic` fill and ink per trigger, read off `M14-list`. The three kinds
 * the frame does not draw (`period_paid`, `unit_out_of_service`) take the tone
 * their §6.8 trigger implies rather than a sixth invented one.
 */
const GLYPH: Record<
  NotificationKind,
  { icon: LucideIcon; bg: string; ink: string }
> = {
  job_assigned: {
    icon: Briefcase,
    bg: tint.statProgress,
    ink: colors.stProgress,
  },
  job_updated: { icon: RefreshCw, bg: colors.surface3, ink: colors.navy },
  message: {
    icon: MessageSquare,
    bg: tint.statProgress,
    ink: colors.stProgress,
  },
  overdue: { icon: AlertTriangle, bg: colors.amberTint, ink: colors.amberInk },
  approved: { icon: CheckCircle2, bg: colors.okBg, ink: colors.stDone },
  period_paid: { icon: Banknote, bg: colors.okBg, ink: colors.stDone },
  unit_out_of_service: {
    icon: AlertTriangle,
    bg: tint.statOverdue,
    ink: colors.stOverdueInk,
  },
};

type ListItem =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'row'; key: string; notification: AppNotification; last: boolean };

/**
 * `M14-list` / `M14-empty` — the Alerts tab.
 *
 * Rows link back to their job (§4). Reading one clears its flag through the
 * single selector in the mock store, which is the same read the Alerts tab dot
 * and M18's bell badge subscribe to (§6.8).
 */
export const NotificationsScreen = ({
  navigation,
}: Props): React.JSX.Element => {
  const { data, loading, error, reload } = useAsync<AppNotification[]>(
    () => notificationsRepo.list(),
    [],
  );

  const notifications = useMemo(() => data ?? [], [data]);

  /** `.sect-lbl` group headers, flattened so one FlatList renders both. */
  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    let group: string | null = null;
    notifications.forEach((n, i) => {
      if (n.group !== group) {
        group = n.group;
        out.push({ kind: 'header', key: `H-${n.group}`, label: n.group });
      }
      out.push({
        kind: 'row',
        key: n.id,
        notification: n,
        last:
          i === notifications.length - 1 ||
          notifications[i + 1].group !== n.group,
      });
    });
    return out;
  }, [notifications]);

  const open = useCallback(
    (n: AppNotification) => {
      notificationsRepo
        .markRead(n.id)
        .then(reload)
        .catch(() => undefined);
      if (n.jobId) {
        navigation.navigate('JobDetail', { jobId: n.jobId });
      }
    },
    [navigation, reload],
  );

  const markAll = useCallback(() => {
    notificationsRepo
      .markAllRead()
      .then(reload)
      .catch(() => undefined);
  }, [reload]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === 'header') {
        return <SectionLabel label={item.label} />;
      }
      const n = item.notification;
      const g = GLYPH[n.kind];
      return (
        <Row
          icon={g.icon}
          iconColor={g.ink}
          iconBackground={g.bg}
          title={n.title}
          subtitle={n.body}
          onPress={() => open(n)}
          // An unread row sits on `--info-bg` with an 8px `--st-progress` dot.
          highlighted={!n.read}
          right={n.read ? undefined : <View style={styles.dot} />}
          last={item.last}
        />
      );
    },
    [open],
  );

  const anyUnread = notifications.some(n => !n.read);

  return (
    <View style={styles.screen}>
      <Topbar
        title="Notifications"
        large
        right={
          // `M14-empty` drops this control — with nothing to read there is
          // nothing to mark. Same rule when everything is already read.
          anyUnread ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mark all as read"
              onPress={markAll}
              hitSlop={6}
              style={({ pressed }) => [
                styles.iconbtn,
                pressed ? styles.pressed : null,
              ]}
            >
              <CheckCheck
                size={iconSize.iconBtn}
                color={colors.text}
                strokeWidth={2.2}
              />
            </Pressable>
          ) : undefined
        }
      />

      {error ? (
        <View style={styles.errorWrap}>
          <Toast tone="err" message={error} />
          <Button
            label="Try again"
            variant="secondary"
            onPress={reload}
            block
            style={styles.retry}
          />
        </View>
      ) : notifications.length === 0 ? (
        loading ? (
          <View style={styles.flex} />
        ) : (
          <Empty
            icon={BellOff}
            title="No notifications"
            body="You're all caught up. Job assignments and messages will show up here."
          />
        )
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.scrl}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const keyExtractor = (item: ListItem): string => item.key;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  iconbtn: {
    width: chrome.iconButton,
    height: chrome.iconButton,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  pressed: { opacity: 0.7 },
  // `.scrl { padding: 0 0 100px }` — the 100 cleared the frame's own `.tbar`.
  scrl: { paddingBottom: 16 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.stProgress,
  },
  errorWrap: { paddingHorizontal: 18, paddingTop: 14 },
  retry: { marginTop: 12 },
});
