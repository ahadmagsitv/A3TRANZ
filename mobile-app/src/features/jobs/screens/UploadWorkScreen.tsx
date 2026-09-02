import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { launchImageLibrary } from 'react-native-image-picker';
import { Camera, Plus, Upload } from 'lucide-react-native';
import {
  Button,
  DeletePhotoSheet,
  Field,
  ProgressBar,
  Thumb,
  Toast,
  Topbar,
} from '../../../components';
import { chatRepo, jobsRepo } from '../../../data/repos';
import { errorMessage } from '../../../hooks/useAsync';
import { chrome, colors, radii, spacing } from '../../../theme/tokens';
import { text } from '../../../theme/typography';
import type { AppStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'UploadWork'>;

const COLUMNS = 3;
const GAP = 8;
/** The frame renders 63%; the bar has to move, so it moves in even steps. */
const TICK_MS = 180;
const TICK_PERCENT = 9;

interface Picked {
  id: string;
  uri: string;
  /** 0–100 while uploading, null once it has landed. No delete until then. */
  progress: number | null;
}

/**
 * `M10-uploading` — Upload work.
 *
 * Reached from a `.pslot` tap in the capture flow (M20/M21/M22), which is
 * PHASE 3; the route is registered and the screen is complete, it simply has no
 * inbound edge yet. That matches the demo graph, where M10's only callers are
 * those three frames.
 *
 * These are LOOSE photos, not evidence: they never satisfy a step gate. The
 * labelled `.pslot` set is the only thing that unlocks a step (§6.1).
 */
export const UploadWorkScreen = ({
  navigation,
  route,
}: Props): React.JSX.Element => {
  const { jobId } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollViewInstance>(null);

  const [picked, setPicked] = useState<Picked[]>([]);
  const [note, setNote] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Picked | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cell = (width - spacing.screenH * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  /**
   * ponytail: the transfer is a timer because there is no API to transfer to.
   * When one exists, replace this effect with the upload task's progress
   * callback — the rendered states (`.ov` overlay, `.progress` bar) stay as-is.
   */
  const inFlight = picked.some(p => p.progress !== null);
  useEffect(() => {
    if (!inFlight) {
      return;
    }
    const timer = setInterval(() => {
      setPicked(current =>
        current.map(p => {
          if (p.progress === null) {
            return p;
          }
          const next = p.progress + TICK_PERCENT;
          return next >= 100 ? { ...p, progress: null } : { ...p, progress: next };
        }),
      );
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [inFlight]);

  const pick = useCallback(() => {
    setError(null);
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 0 })
      .then(result => {
        if (result.didCancel || !result.assets) {
          return;
        }
        const added = result.assets
          .map(a => a.uri)
          .filter((uri): uri is string => Boolean(uri))
          .map((uri, i) => ({
            id: `PICK-${Date.now()}-${i}`,
            uri,
            progress: 0,
          }));
        setPicked(current => [...current, ...added]);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  const removePicked = useCallback(() => {
    if (pendingDelete) {
      setPicked(current => current.filter(p => p.id !== pendingDelete.id));
      setPendingDelete(null);
    }
  }, [pendingDelete]);

  /** §6.3 — the note is under the dropzone, so bring it into view on focus. */
  const revealNote = useCallback(
    () => scrollRef.current?.scrollToEnd({ animated: true }),
    [],
  );

  const submit = useCallback(() => {
    setUploading(true);
    setError(null);
    const uris = picked.map(p => p.uri);
    const trimmed = note.trim();
    const work = uris.length > 0 ? jobsRepo.addJobPhotos(jobId, uris) : Promise.resolve();
    work
      .then(() =>
        trimmed.length > 0 ? chatRepo.addNote(jobId, trimmed) : undefined,
      )
      .then(() => navigation.goBack())
      .catch((e: unknown) => {
        setError(errorMessage(e));
        setUploading(false);
      });
  }, [picked, note, jobId, navigation]);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const nothingToSend = picked.length === 0 && note.trim().length === 0;
  const lockCopy = inFlight
    ? 'Waiting for the photos to finish uploading'
    : nothingToSend
    ? 'Add a photo or a note to upload'
    : null;
  const progress = picked.find(p => p.progress !== null)?.progress ?? null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Topbar title="Upload work" onBack={goBack} />

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.scrl}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {error ? <Toast tone="err" message={error} style={styles.err} /> : null}

        {/* `.dropzone` */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose photos from your library"
          onPress={pick}
          style={({ pressed }) => [
            styles.dropzone,
            pressed ? styles.pressed : null,
          ]}
        >
          <Camera size={26} color={colors.navy} strokeWidth={2} />
          <Text style={styles.dropzoneText}>
            Take a photo or choose from library
          </Text>
        </Pressable>

        <View style={styles.thumbs}>
          {picked.map(p => (
            <View key={p.id} style={[styles.cell, { width: cell }]}>
              <Thumb
                uri={p.uri}
                alt="Photo you are uploading"
                uploadProgress={p.progress}
                onRequestDelete={
                  p.progress === null ? () => setPendingDelete(p) : undefined
                }
              />
            </View>
          ))}
          {/* The dashed add tile — a one-off, so it stays inline. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add another photo"
            onPress={pick}
            style={[styles.cell, styles.addTile, { width: cell }]}
          >
            <Plus size={22} color={colors.navy} strokeWidth={2} />
          </Pressable>
        </View>

        {progress !== null ? <ProgressBar percent={progress} /> : null}

        <View style={styles.noteWrap}>
          <Field
            label="Add a note"
            value={note}
            onChangeText={setNote}
            onFocus={revealNote}
            placeholder="Describe the work done, seal numbers, or anything the admin should know…"
            multiline
            numberOfLines={4}
            autoCapitalize="sentences"
          />
        </View>
      </ScrollView>

      <View style={[styles.btnbar, { paddingBottom: 20 + insets.bottom }]}>
        <Button
          label="Upload & attach"
          variant="amber"
          icon={Upload}
          onPress={submit}
          loading={uploading}
          locked={nothingToSend || inFlight}
          lockCopy={lockCopy}
          block
        />
      </View>

      <DeletePhotoSheet
        visible={pendingDelete !== null}
        subject="Photo you are uploading"
        warning="It has not been sent yet — removing it here simply drops it."
        onConfirm={removePicked}
        onCancel={() => setPendingDelete(null)}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrl: {
    paddingTop: spacing.screenV,
    paddingHorizontal: spacing.screenH,
    paddingBottom: 20,
  },
  err: { marginBottom: 12 },
  dropzone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radii.r2,
    backgroundColor: colors.surface2,
    padding: 22,
    alignItems: 'center',
  },
  pressed: { opacity: 0.85 },
  dropzoneText: {
    ...text(500, 14),
    color: colors.text2,
    textAlign: 'center',
    marginTop: 6,
  },
  thumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    marginTop: 12,
  },
  cell: { aspectRatio: 1 },
  addTile: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radii.r,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteWrap: { marginTop: 16 },
  btnbar: {
    paddingTop: chrome.btnBarPadding.top,
    paddingHorizontal: chrome.btnBarPadding.horizontal,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
