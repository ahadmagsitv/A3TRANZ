import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MessageSquare, Search } from 'lucide-react-native';
import {
  Button,
  ChatRow,
  Empty,
  SearchButton,
  SearchInput,
  matchesQuery,
  Toast,
  Topbar,
} from '../../../components';
import { chatRepo, subscribeLive } from '../../../data/repos';
import type { Thread } from '../../../data/contracts';
import { useAsync } from '../../../hooks/useAsync';
import { colors } from '../../../theme/tokens';
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
  /** null = search closed. */
  const [query, setQuery] = useState<string | null>(null);
  const threads = useMemo(
    () =>
      (data ?? []).filter(t =>
        matchesQuery(query ?? '', t.adminLabel, t.jobTitle, t.jobId, t.preview),
      ),
    [data, query],
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
        last={index === threads.length - 1}
      />
    ),
    [openThread, threads],
  );

  return (
    <View style={styles.screen}>
      <Topbar
        title="Chats"
        large
        right={
          <SearchButton
            open={query !== null}
            onPress={() => setQuery(q => (q === null ? '' : null))}
          />
        }
      />
      {query !== null ? (
        <SearchInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search chats"
        />
      ) : null}

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
          query?.trim() ? (
            <Empty
              icon={Search}
              title="No matching chats"
              body={`Nothing matches "${query.trim()}".`}
            />
          ) : (
            <Empty
              icon={MessageSquare}
              title="No messages yet"
              body="Threads open when the office messages you about a job."
            />
          )
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
  // `.scrl { padding-bottom: 100px }` cleared the frame's own 84px `.tbar`,
  // which is the navigator's view here.
  scrl: { paddingBottom: 16, backgroundColor: colors.surface },
  errorWrap: { paddingHorizontal: 18, paddingTop: 14 },
  retry: { marginTop: 12 },
});
