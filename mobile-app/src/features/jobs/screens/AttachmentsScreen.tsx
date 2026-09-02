import React, { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  DeletePhotoSheet,
  Empty,
  FileChip,
  Thumb,
  Toast,
  Topbar,
} from '../../../components';
import { Paperclip } from 'lucide-react-native';
import { jobsRepo } from '../../../data/repos';
import type { Job, JobPhoto } from '../../../data/contracts';
import { errorMessage, useAsync } from '../../../hooks/useAsync';
import { colors, spacing } from '../../../theme/tokens';
import { text } from '../../../theme/typography';
import type { AppStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Attachments'>;

/** `.thumbs { grid-template-columns: repeat(3,1fr); gap: 8px }` */
const COLUMNS = 3;
const GAP = 8;

/**
 * `M8-photos-docs`.
 *
 * Photos are the driver's and are deletable behind a confirm sheet; documents
 * carry a download control and no delete at all (§8 Q5). The `.del` badge is a
 * 22px corner badge on the thumbnail, never a trailing button (§6.2).
 */
export const AttachmentsScreen = ({
  navigation,
  route,
}: Props): React.JSX.Element => {
  const { jobId } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const {
    data: job,
    loading,
    error,
    reload,
  } = useAsync<Job | null>(() => jobsRepo.get(jobId), [jobId]);

  const [pending, setPending] = useState<JobPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const cell = useMemo(
    () => (width - spacing.screenH * 2 - GAP * (COLUMNS - 1)) / COLUMNS,
    [width],
  );

  // M8's chevron-left returns to the job detail it was pushed from — the demo's
  // only outbound edge from this frame besides the delete sheets. It used to
  // push `UploadWork`, which both lost the M8 → M7 edge and stranded the driver
  // on a screen with no way back to the job.
  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  const cancelDelete = useCallback(() => setPending(null), []);

  const confirmDelete = useCallback(() => {
    if (!pending) {
      return;
    }
    setBusy(true);
    setDeleteError(null);
    jobsRepo
      .deleteJobPhoto(jobId, pending.id)
      .then(() => {
        setPending(null);
        reload();
      })
      .catch((e: unknown) => setDeleteError(errorMessage(e)))
      .finally(() => setBusy(false));
  }, [pending, jobId, reload]);

  const photos = job?.photos ?? [];
  const documents = job?.attachments.filter(a => a.kind === 'document') ?? [];
  const nothing =
    !loading && !error && photos.length === 0 && documents.length === 0;

  return (
    <View style={styles.screen}>
      <Topbar title="Attachments" onBack={goBack} />

      {nothing ? (
        <Empty
          icon={Paperclip}
          title="Nothing attached yet"
          body="Photos you upload and documents from the office appear here."
        />
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrl,
            { paddingBottom: 16 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <>
              <Toast tone="err" message={error} />
              <Button
                label="Try again"
                variant="secondary"
                onPress={reload}
                block
                style={styles.retry}
              />
            </>
          ) : null}

          {deleteError ? (
            <Toast
              tone="err"
              message={deleteError}
              style={styles.deleteError}
            />
          ) : null}

          {photos.length > 0 ? (
            <>
              <Text style={styles.sectLabel}>Photos · {photos.length}</Text>
              <View style={styles.thumbs}>
                {photos.map(photo => (
                  <View
                    key={photo.id}
                    style={[styles.cell, { width: cell }]}
                  >
                    <Thumb
                      uri={photo.uri}
                      alt={photo.alt}
                      onRequestDelete={() => setPending(photo)}
                    />
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {documents.length > 0 ? (
            <>
              <Text style={styles.sectLabel}>
                Documents · {documents.length}
              </Text>
              {documents.map(a => (
                <FileChip key={a.id} attachment={a} showOrigin />
              ))}
            </>
          ) : null}
        </ScrollView>
      )}

      <DeletePhotoSheet
        visible={pending !== null}
        subject={pending?.alt ?? ''}
        /* The evidence wording ("re-opens this step") belongs to the capture
           flow. These are loose job photos: no gate re-opens, but the office
           loses the shot, so it still confirms. */
        warning="This removes the photo from the job for good — the office will no longer see it."
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  /** `.scrl.pad { padding: 16px 18px }` */
  scrl: { paddingTop: spacing.screenV, paddingHorizontal: spacing.screenH },
  retry: { marginTop: 12 },
  deleteError: { marginTop: 12 },
  sectLabel: {
    ...text(700, 12, 0.5),
    color: colors.text2,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cell: { aspectRatio: 1 },
});
