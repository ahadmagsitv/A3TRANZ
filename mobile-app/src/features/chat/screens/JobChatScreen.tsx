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
import type { AttachChoice, ChatDraftAttachment } from '../../../components';
import { AttachSheet } from '../../../components';
import type { PickedFile } from '../../capture/pickPhoto';
import {
  pickDocument,
  pickFromLibrary,
  takePhoto,
} from '../../capture/pickPhoto';
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
  const [attachment, setAttachment] = useState<ChatDraftAttachment | null>(null);
  const [attaching, setAttaching] = useState(false);

  const [attachMenu, setAttachMenu] = useState(false);

  /**
   * Pick, upload, and hold — the file goes to the bucket now so Send is a
   * single fast call, and so a failure surfaces here where it can still be
   * retried rather than after the driver has typed a message.
   */
  const attach = useCallback(
    (choice: AttachChoice) => {
      setSendError(null);
      setAttaching(true);

      // The image pickers hand back a bare uri; the document picker knows the
      // real name and type. Both end up as the same three fields.
      const pick: () => Promise<PickedFile | null> =
        choice === 'document'
          ? pickDocument
          : async () => {
              const uri = await (choice === 'camera'
                ? takePhoto()
                : pickFromLibrary());
              if (uri === null) {
                return null;
              }
              return {
                uri,
                name: uri.split('/').pop()?.split('?')[0] ?? 'photo.jpg',
                type: /\.png($|\?)/i.test(uri) ? 'image/png' : 'image/jpeg',
              };
            };

      pick()
        .then(async file => {
          // A cancelled picker is not an upload.
          if (file === null) {
            return;
          }
          const key = await chatRepo.uploadAttachment(
            threadId,
            file.uri,
            file.type,
          );
          setAttachment({ ...file, key, previewUri: file.uri });
        })
        .catch((e: unknown) => setSendError(errorMessage(e)))
        .finally(() => setAttaching(false));
    },
    [threadId],
  );

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
    // Notes belong to a job. A direct thread has none, and its strip is not
    // pressable — this guard is what makes that true in the data too.
    const jobId = data?.thread?.jobId;
    if (jobId) {
      navigation.navigate('JobNotes', { jobId });
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
    // An attachment on its own is a message — only both being empty is not.
    if (body.length === 0 && !attachment) {
      return;
    }
    const held = attachment;
    setDraft('');
    setAttachment(null);
    setSendError(null);
    chatRepo
      .send(threadId, body, held)
      .then(message => setSent(prev => [...prev, message]))
      .catch((e: unknown) => {
        // Give the driver their words AND their file back — losing either to a
        // failed send is the one thing this screen must never do. The upload
        // already succeeded, so the attachment is still good to retry.
        setDraft(body);
        setAttachment(held);
        setSendError(errorMessage(e));
      });
  }, [draft, threadId, attachment]);

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
      {data?.thread?.jobId ? (
        <ChatContext
          jobId={data.thread.jobId}
          jobTitle={data.thread.jobTitle ?? ''}
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
          onAttach={() => setAttachMenu(true)}
          attachment={attachment}
          onRemoveAttachment={() => setAttachment(null)}
          attaching={attaching}
          // The KAV owns the space under the bar once the keyboard is up;
          // keeping the inset too would leave a dead band above the keys.
          bottomInset={keyboardVisible ? 0 : insets.bottom}
        />
      </KeyboardAvoidingView>

      <AttachSheet
        visible={attachMenu}
        onDismiss={() => setAttachMenu(false)}
        onChoose={attach}
      />
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
