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

export const ChatsScreen = ({ navigation }: Props): React.JSX.Element => {
  const { data, loading, error, reload } = useAsync<Thread[]>(
    () => chatRepo.threads(),
    [],
  );
  const [query, setQuery] = useState<string | null>(null);
  const threads = useMemo(
    () =>
      (data ?? []).filter(t =>
        matchesQuery(query ?? '', t.adminLabel, t.jobTitle, t.jobId, t.preview),
      ),
    [data, query],
  );

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
        loading ? (
          <View style={styles.flex} />
        ) : (
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
  scrl: { paddingBottom: 16, backgroundColor: colors.surface },
  errorWrap: { paddingHorizontal: 18, paddingTop: 14 },
  retry: { marginTop: 12 },
});
