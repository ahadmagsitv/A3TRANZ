import React, { useCallback, useEffect } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MessageSquare, Search } from 'lucide-react-native';
import {
  Button,
  ChatRow,
  Empty,
  Toast,
  Topbar,
} from '../../../components';
import { chatRepo, subscribeLive } from '../../../data/repos';
import type { Thread } from '../../../data/contracts';
import { useAsync } from '../../../hooks/useAsync';
import { chrome, colors, iconSize, radii } from '../../../theme/tokens';
import type {
  AppStackParamList,
  TabParamList,
} from '../../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Chat'>,
  NativeStackScreenProps<AppStackParamList>
>;

/**
 * `M27-list` — the Chat tab's ROOT.
 *
 * The tab always opens this list, never a single thread (§6.8). Threads are
 * job-scoped, so every row carries the job it belongs to and the unread `.bdg`
 * that feeds the tab dot.
 *
 * `useAsync` re-runs on focus, so coming back from a thread the driver just
 * read repaints the row without its badge — the same read that clears the tab
 * dot.
 */
export const ChatsScreen = ({ navigation }: Props): React.JSX.Element => {
  const { data, loading, error, reload } = useAsync<Thread[]>(
    () => chatRepo.threads(),
    [],
  );

  // Live: a new message moves its thread to the top without a pull-to-refresh.
  // The event is only a nudge — the refetch is what reads the thread, so
  // authorization stays on the server.
  useEffect(
    () => subscribeLive(e => (e.type === 'message' ? reload() : undefined)),
    [reload],
  );

  const openThread = useCallback(
    (threadId: string) => navigation.navigate('JobChat', { threadId }),
    [navigation],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Thread; index: number }) => (
      <ChatRow
        thread={item}
        onPress={() => openThread(item.id)}
        last={index === (data?.length ?? 0) - 1}
      />
    ),
    [openThread, data],
  );

  const threads = data ?? [];

  return (
    <View style={styles.screen}>
      <Topbar
        title="Chats"
        large
        right={
          /* The frame draws a search affordance; the flow graph gives it no
             target and no results frame exists, so it renders as the
             `.iconbtn` it is rather than as a button that does nothing.
             ponytail: wire it the day a search frame exists. */
          <View
            style={styles.iconbtn}
            importantForAccessibility="no-hide-descendants"
          >
            <Search
              size={iconSize.iconBtn}
              color={colors.muted}
              strokeWidth={2.2}
            />
          </View>
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
      ) : threads.length === 0 ? (
        // Never claim an empty inbox while the first read is in flight.
        loading ? (
          <View style={styles.flex} />
        ) : (
          /* M27 has no designed empty frame — §8 Q7's ruling applies: reuse
             `.empty` with its own copy rather than invent a second visual. */
          <Empty
            icon={MessageSquare}
            title="No messages yet"
            body="Threads open when the office messages you about a job."
          />
        )
      ) : (
        <FlatList
          data={threads}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.scrl}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const keyExtractor = (thread: Thread): string => thread.id;

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
  // `.scrl { padding-bottom: 100px }` cleared the frame's own 84px `.tbar`,
  // which is the navigator's view here.
  scrl: { paddingBottom: 16, backgroundColor: colors.surface },
  errorWrap: { paddingHorizontal: 18, paddingTop: 14 },
  retry: { marginTop: 12 },
});
