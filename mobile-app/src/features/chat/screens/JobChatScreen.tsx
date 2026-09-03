import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  ChatBar,
  ChatBubble,
  ChatContext,
  Toast,
  Topbar,
} from '../../../components';
import { chatRepo, subscribeLive } from '../../../data/repos';
import type { Message, Thread } from '../../../data/contracts';
import { errorMessage, useAsync } from '../../../hooks/useAsync';
import { useKeyboardVisible } from '../../../hooks/useKeyboardVisible';
import { colors } from '../../../theme/tokens';
import type { AppStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'JobChat'>;

interface ChatData {
  thread: Thread | null;
  messages: Message[];
}

/**
 * `M12-with-admin` — the job chat.
 *
 * Reached from M27 (the thread list) and from M7's topbar. Its `.chat-ctx`
 * strip is the only inbound edge to M13 in the flow graph.
 *
 * Opening it clears the thread's unread flag, which recomputes the Chat tab dot
 * through the one selector in the mock store (§6.8) — not through a counter
 * this screen keeps.
 */
export const JobChatScreen = ({
  navigation,
  route,
}: Props): React.JSX.Element => {
  const { threadId } = route.params;
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const list = useRef<FlatList<Message>>(null);

  const { data, error, reload } = useAsync<ChatData>(async () => {
    // `markThreadRead` first: the badge must be gone by the time the thread is
    // on screen, not one render later.
    await chatRepo.markThreadRead(threadId);
    const [threads, messages] = await Promise.all([
      chatRepo.threads(),
      chatRepo.messages(threadId),
    ]);
    return { thread: threads.find(t => t.id === threadId) ?? null, messages };
  }, [threadId]);

  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<Message[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  /**
   * A focus reload picks up everything already stored, so the optimistic tail
   * is merged by id rather than concatenated — otherwise every message sent
   * this session doubles the next time the screen refocuses.
   */
  const messages = useMemo(() => {
    const base = data?.messages ?? [];
    const seen = new Set(base.map(m => m.id));
    return [...base, ...sent.filter(m => !seen.has(m.id))];
  }, [data, sent]);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const openNotes = useCallback(() => {
    if (data?.thread) {
      navigation.navigate('JobNotes', { jobId: data.thread.jobId });
    }
  }, [navigation, data]);

  // Live: a reply from the office lands without leaving the screen. The event
  // is only a nudge — the refetch is what actually reads the thread, so
  // authorization stays on the server.
  useEffect(
    () => subscribeLive(e => (e.type === 'message' ? reload() : undefined)),
    [reload],
  );

  const send = useCallback(() => {
    const body = draft.trim();
    if (body.length === 0) {
      return;
    }
    setDraft('');
    setSendError(null);
    chatRepo
      .send(threadId, body)
      .then(message => setSent(prev => [...prev, message]))
      .catch((e: unknown) => {
        // Give the driver their words back — losing a typed message to a
        // failed send is the one thing this screen must never do.
        setDraft(body);
        setSendError(errorMessage(e));
      });
  }, [draft, threadId]);

  const scrollToNewest = useCallback(
    () => list.current?.scrollToEnd({ animated: false }),
    [],
  );

  // The list stays on the newest item as the keyboard opens (§6.3).
  useEffect(() => {
    if (keyboardVisible) {
      scrollToNewest();
    }
  }, [keyboardVisible, scrollToNewest]);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => <ChatBubble message={item} />,
    [],
  );

  return (
    <View style={styles.screen}>
      <Topbar
        title={data?.thread?.adminLabel ?? 'Chat'}
        onBack={goBack}
      />
      {data?.thread ? (
        <ChatContext
          jobId={data.thread.jobId}
          jobTitle={data.thread.jobTitle}
          onPress={openNotes}
        />
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
        ) : (
          <FlatList
            ref={list}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ItemSeparatorComponent={Gap}
            contentContainerStyle={styles.chatwrap}
            onContentSizeChange={scrollToNewest}
            showsVerticalScrollIndicator={false}
          />
        )}

        {sendError ? (
          <View style={styles.sendError}>
            <Toast tone="err" message={sendError} />
          </View>
        ) : null}

        <ChatBar
          placeholder="Message…"
          value={draft}
          onChangeText={setDraft}
          onSend={send}
          // The KAV owns the space under the bar once the keyboard is up;
          // keeping the inset too would leave a dead band above the keys.
          bottomInset={keyboardVisible ? 0 : insets.bottom}
        />
      </KeyboardAvoidingView>
    </View>
  );
};

const keyExtractor = (message: Message): string => message.id;
/** `.chatwrap { gap: 12px }` */
const Gap = (): React.JSX.Element => <View style={styles.gap} />;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  // `.chatwrap { padding: 16px 16px }`
  chatwrap: { padding: 16, flexGrow: 1, justifyContent: 'flex-end' },
  gap: { height: 12 },
  errorWrap: { paddingHorizontal: 18, paddingTop: 14 },
  retry: { marginTop: 12 },
  sendError: { paddingHorizontal: 14, paddingBottom: 10 },
});
