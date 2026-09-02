import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FileText } from 'lucide-react-native';
import {
  Button,
  ChatBar,
  ChatContext,
  Empty,
  Toast,
  Topbar,
} from '../../../components';
import { chatRepo, jobsRepo } from '../../../data/repos';
import type { Job, Note } from '../../../data/contracts';
import { errorMessage, useAsync } from '../../../hooks/useAsync';
import { useKeyboardVisible } from '../../../hooks/useKeyboardVisible';
import { colors, radii } from '../../../theme/tokens';
import { display, tabular, text } from '../../../theme/typography';
import type { AppStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'JobNotes'>;

interface NotesData {
  job: Job | null;
  notes: Note[];
}

/**
 * `.row` with `align-items:flex-start`, an initials well instead of a glyph, a
 * timestamp inside `.row-t` and `.row-s` in `--text` rather than `--text-2`.
 *
 * That is four divergences from `Row` for exactly one caller, so it stays here
 * rather than growing `Row` four props it would use nowhere else.
 */
const NoteRow = memo(function NoteRow({
  note,
  isAdmin,
  last,
}: {
  note: Note;
  isAdmin: boolean;
  last: boolean;
}) {
  return (
    <View style={styles.note}>
      {/* The office writes on amber, the driver on navy — same well, the two
          fills the frame uses to tell them apart at a glance. */}
      <View
        style={[styles.well, isAdmin ? styles.wellAdmin : styles.wellDriver]}
      >
        <Text
          style={[
            styles.initials,
            isAdmin ? styles.initialsAdmin : styles.initialsDriver,
          ]}
        >
          {note.initials}
        </Text>
      </View>
      <View style={styles.noteBody}>
        <Text style={styles.author}>
          {note.authorName}{' '}
          <Text style={styles.when}>· {note.whenLabel}</Text>
        </Text>
        <Text style={styles.body}>{note.body}</Text>
      </View>
      {last ? null : <View style={styles.divider} />}
    </View>
  );
});

/**
 * `M13-default` — job notes.
 *
 * Same compose bar and keyboard handling as M12 (§6.3); the stream is
 * attributed and timestamped rather than bubbled, because a note is a record on
 * the job and not a message to a person.
 *
 * Reached from M12's `.chat-ctx` — the only inbound edge in the flow graph.
 */
export const JobNotesScreen = ({
  navigation,
  route,
}: Props): React.JSX.Element => {
  const { jobId } = route.params;
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const list = useRef<FlatList<Note>>(null);

  const { data, loading, error, reload } = useAsync<NotesData>(async () => {
    const [job, notes] = await Promise.all([
      jobsRepo.get(jobId),
      chatRepo.notes(jobId),
    ]);
    return { job, notes };
  }, [jobId]);

  const [draft, setDraft] = useState('');
  const [added, setAdded] = useState<Note[]>([]);
  const [addError, setAddError] = useState<string | null>(null);

  /** Merged by id so a focus reload does not double this session's notes. */
  const notes = useMemo(() => {
    const base = data?.notes ?? [];
    const seen = new Set(base.map(n => n.id));
    return [...base, ...added.filter(n => !seen.has(n.id))];
  }, [data, added]);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const addNote = useCallback(() => {
    const body = draft.trim();
    if (body.length === 0) {
      return;
    }
    setDraft('');
    setAddError(null);
    chatRepo
      .addNote(jobId, body)
      .then(note => setAdded(prev => [...prev, note]))
      .catch((e: unknown) => {
        setDraft(body);
        setAddError(errorMessage(e));
      });
  }, [draft, jobId]);

  const scrollToNewest = useCallback(
    () => list.current?.scrollToEnd({ animated: false }),
    [],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Note; index: number }) => (
      <NoteRow
        note={item}
        isAdmin={item.authorId.startsWith('ADM')}
        last={index === notes.length - 1}
      />
    ),
    [notes.length],
  );

  return (
    <View style={styles.screen}>
      <Topbar title="Notes" onBack={goBack} />
      {data?.job ? (
        <ChatContext jobId={data.job.id} jobTitle={data.job.title} />
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
        ) : notes.length === 0 && !loading ? (
          /* No empty frame is designed for M13; §8 Q7's ruling applies —
             reuse `.empty` with its own copy. The compose bar stays, so the
             state is an invitation rather than a dead end. */
          <Empty
            icon={FileText}
            title="No notes yet"
            body="Add what happened on this job — the office reads these."
          />
        ) : (
          <FlatList
            ref={list}
            data={notes}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.scrl}
            onContentSizeChange={scrollToNewest}
            showsVerticalScrollIndicator={false}
          />
        )}

        {addError ? (
          <View style={styles.addError}>
            <Toast tone="err" message={addError} />
          </View>
        ) : null}

        <ChatBar
          placeholder="Add a note…"
          value={draft}
          onChangeText={setDraft}
          onSend={addNote}
          bottomInset={keyboardVisible ? 0 : insets.bottom}
        />
      </KeyboardAvoidingView>
    </View>
  );
};

const keyExtractor = (note: Note): string => note.id;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  // `.scrl { padding: 8px 0 8px }`
  scrl: { paddingVertical: 8, backgroundColor: colors.surface, flexGrow: 1 },
  errorWrap: { paddingHorizontal: 18, paddingTop: 14 },
  retry: { marginTop: 12 },
  addError: { paddingHorizontal: 14, paddingBottom: 10 },

  // `.row { padding:14px 16px; gap:12 }` with `align-items:flex-start`
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
  },
  // `.row::after { left: 60px }`
  divider: {
    position: 'absolute',
    left: 60,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  // `.row-ic`
  well: {
    width: 40,
    height: 40,
    borderRadius: radii.r,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  wellDriver: { backgroundColor: colors.navy },
  wellAdmin: { backgroundColor: colors.amber },
  initials: { ...display(800, 13) },
  initialsDriver: { color: colors.onNavy },
  initialsAdmin: { color: colors.onAmber },
  noteBody: { flex: 1, minWidth: 0 },
  // `.row-t`
  author: { ...text(600, 15), color: colors.text },
  /**
   * The frame writes `--muted` here, but §7 gate 1 is explicit: `--muted` is
   * never copy (2.6:1). A timestamp is copy, so it takes `--text-2` (5:1).
   * Deliberate, logged deviation — the token table and the frame disagree.
   */
  when: { ...text(500, 12), ...tabular, color: colors.text2 },
  // `.row-s` overridden to `--text` — a note is content, not metadata.
  body: { ...text(500, 13), color: colors.text, marginTop: 2 },
});
