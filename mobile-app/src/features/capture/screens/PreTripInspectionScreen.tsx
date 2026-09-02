import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AlertTriangle, MessageSquare, Play } from 'lucide-react-native';
import {
  Button,
  InspectionRow,
  JobHeader,
  Stepper,
  Toast,
  Topbar,
  UnitChip,
} from '../../../components';
import { chatRepo, jobsRepo } from '../../../data/repos';
import type {
  InspectionItem,
  InspectionResult,
  Job,
} from '../../../data/contracts';
import {
  blankInspection,
  inspectionState,
  pretripGate,
} from '../../../data/jobStateMachine';
import { errorMessage, useAsync } from '../../../hooks/useAsync';
import { pickPhoto } from '../pickPhoto';
import { chrome, colors, spacing } from '../../../theme/tokens';
import { text } from '../../../theme/typography';
import type { AppStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'PreTripInspection'>;

/** The row the driver has marked ✗ but has not yet described. */
interface Draft {
  itemId: string;
  note: string;
  photoUri: string | null;
}

/**
 * `M19-8-of-12-checked` · `M19-all-pass` · `M19-defect-found` — ① Pre-trip.
 *
 * The whole point of this screen is one rule: **a ✗ with no note is an invalid
 * state**, and it is rejected at the point of interaction. Tapping ✗ does NOT
 * write to the store — it opens a local draft. The draft is committed through
 * `setInspectionItem`, which runs `validateInspectionItem` and throws on a
 * blank note. Nothing here re-implements that check; the screen just renders
 * what the machine says (§6.1).
 *
 * One defect blocks the job AND flags the unit out of service. That is
 * `reportDefect` on the repo — a real transition that mutates the fleet record
 * and pushes the dispatch notification, never a local `blocked` boolean.
 */
export const PreTripInspectionScreen = ({
  navigation,
  route,
}: Props): React.JSX.Element => {
  const { jobId } = route.params;
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);
  /** Row-top offsets, so a focused note scrolls its row into view WITH it. */
  const rowTops = useRef<Record<string, number>>({});

  const {
    data: job,
    loading,
    error: loadError,
    reload,
  } = useAsync<Job | null>(() => jobsRepo.get(jobId), [jobId]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stored = job?.inspection?.items ?? blankInspection().items;

  /**
   * What the driver sees: the committed list with the open draft laid over it.
   * The draft row reads as a defect immediately — the note is required before
   * it *commits*, not before it *appears*.
   */
  const items: InspectionItem[] = useMemo(
    () =>
      stored.map(i =>
        draft && draft.itemId === i.id
          ? {
              ...i,
              result: 'defect' as InspectionResult,
              note: draft.note,
              photoUri: draft.photoUri,
            }
          : i,
      ),
    [stored, draft],
  );

  const state = useMemo(
    () => inspectionState({ items, passedAt: null, loggedByLabel: null }),
    [items],
  );
  const gate = job
    ? pretripGate({
        ...job,
        inspection: { items, passedAt: null, loggedByLabel: null },
      })
    : null;

  const commit = useCallback(
    (
      itemId: string,
      result: InspectionResult,
      note?: string,
      uri?: string | null,
    ) => {
      setError(null);
      return jobsRepo
        .setInspectionItem(jobId, itemId, result, note, uri)
        .then(() => {
          reload();
          return true;
        })
        .catch((e: unknown) => {
          // The machine refused it — most often the blank-note rejection.
          setError(errorMessage(e));
          return false;
        });
    },
    [jobId, reload],
  );

  const onResult = useCallback(
    (itemId: string, result: InspectionResult) => {
      if (result === 'pass') {
        setDraft(current => (current?.itemId === itemId ? null : current));
        commit(itemId, 'pass');
        return;
      }
      // ✗ opens the required note. Nothing is written until it has one.
      setError(null);
      const existing = stored.find(i => i.id === itemId);
      setDraft({
        itemId,
        note: existing?.result === 'defect' ? existing.note ?? '' : '',
        photoUri: existing?.photoUri ?? null,
      });
    },
    [commit, stored],
  );

  const onNoteChange = useCallback((itemId: string, note: string) => {
    setDraft(current =>
      current && current.itemId === itemId ? { ...current, note } : current,
    );
  }, []);

  /**
   * The commit. `setInspectionItem` runs `validateInspectionItem`, so a blank
   * note is refused HERE, at the machine boundary — the draft stays open and
   * the refusal is rendered. The screen never decides what a valid defect is.
   */
  const commitDraft = useCallback(() => {
    if (!draft) {
      return;
    }
    commit(draft.itemId, 'defect', draft.note, draft.photoUri).then(ok => {
      if (ok) {
        setDraft(null);
      }
    });
  }, [draft, commit]);

  const attachPhoto = useCallback(() => {
    pickPhoto().then(uri => {
      if (uri) {
        setDraft(current =>
          current ? { ...current, photoUri: uri } : current,
        );
      }
    });
  }, []);

  /**
   * §6.3 — the row and its note read as one card, so bring the ROW's top edge
   * into view, not the input's. Scrolling to the input alone pushes the item
   * label off the top and the driver loses what they are describing.
   */
  const revealRow = useCallback((itemId: string) => {
    const y = rowTops.current[itemId];
    if (y !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
    }
  }, []);

  const openChat = useCallback(() => {
    chatRepo
      .threads()
      .then(threads => {
        const thread = threads.find(t => t.jobId === jobId);
        if (thread) {
          navigation.navigate('JobChat', { threadId: thread.id });
        }
      })
      .catch(() => undefined);
  }, [navigation, jobId]);

  /** ① defect path — BLOCKED + the unit goes out of service, then dispatch. */
  const reportDefect = useCallback(() => {
    setBusy(true);
    const open = draft;
    const first = open
      ? commit(open.itemId, 'defect', open.note, open.photoUri)
      : Promise.resolve(true);
    first
      .then(committed => {
        if (!committed) {
          return null;
        }
        setDraft(null);
        return jobsRepo.reportDefect(jobId);
      })
      .then(reported => {
        setBusy(false);
        if (reported) {
          reload();
          openChat();
        }
      })
      .catch((e: unknown) => {
        setError(errorMessage(e));
        setBusy(false);
      });
  }, [draft, commit, jobId, reload, openChat]);

  /** ① pass path — 12/12 → IN PROGRESS, then ② Confirm pickup. */
  const startJob = useCallback(() => {
    setBusy(true);
    jobsRepo
      .advance(jobId, 'pretrip')
      .then(() => {
        setBusy(false);
        navigation.navigate('ConfirmPickup', { jobId });
      })
      .catch((e: unknown) => {
        setError(errorMessage(e));
        setBusy(false);
      });
  }, [jobId, navigation]);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const defectCount = state.defects.length;
  const blocked = defectCount > 0;
  const draftIncomplete = draft !== null && draft.note.trim().length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Topbar title="Pre-trip inspection" onBack={goBack} />

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.scrl}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loadError ? (
          <>
            <Toast tone="err" message={loadError} />
            <Button
              label="Try again"
              variant="secondary"
              onPress={reload}
              block
              style={styles.retry}
            />
          </>
        ) : null}

        {!job && !loading && !loadError ? (
          <Toast tone="warn" message="That job is no longer assigned to you." />
        ) : null}

        {job ? (
          <>
            <Stepper current="pretrip" style={styles.stepper} />

            <JobHeader
              id={job.id}
              type={job.type}
              title={job.title}
              customerName={job.customerName}
            />

            {job.truckId || job.chassisId ? (
              <View style={styles.units}>
                {job.truckId ? (
                  <UnitChip
                    id={job.truckId}
                    kind="truck"
                    outOfService={blocked}
                  />
                ) : null}
                {job.chassisId ? (
                  <UnitChip id={job.chassisId} kind="chassis" />
                ) : null}
              </View>
            ) : null}

            {error ? (
              <Toast tone="err" message={error} style={styles.toast} />
            ) : blocked ? (
              <Toast
                tone="warn"
                message={`Job cannot start — ${
                  job.truckId ?? 'this unit'
                } is reported out of service.`}
                style={styles.toast}
              />
            ) : state.allPass ? (
              <Toast
                tone="ok"
                message={`${state.total} of ${state.total} passed — ${
                  job.truckId ?? 'the truck'
                } and ${job.chassisId ?? 'the chassis'} are cleared.`}
                style={styles.toast}
              />
            ) : (
              <Toast
                tone="info"
                message="DOT pre-trip — check every item before this job can start."
                style={styles.toast}
              />
            )}

            <Text style={styles.sectLabel}>
              {blocked
                ? `Inspection items · ${defectCount} defect${
                    defectCount === 1 ? '' : 's'
                  }`
                : `Inspection items · ${state.checked} of ${state.total}`}
            </Text>

            {items.map(item => (
              <View
                key={item.id}
                onLayout={e => {
                  rowTops.current[item.id] = e.nativeEvent.layout.y;
                }}
              >
                <InspectionRow
                  item={item}
                  onResult={result => onResult(item.id, result)}
                  onNoteChange={note => onNoteChange(item.id, note)}
                  onNoteFocus={() => revealRow(item.id)}
                  onNoteBlur={commitDraft}
                  onAddPhoto={attachPhoto}
                />
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* The bar is a flex sibling, so it rides above the keyboard and above
          the Android nav bar without an overlay or a hardcoded height. */}
      <View style={[styles.btnbar, { paddingBottom: 20 + insets.bottom }]}>
        {blocked || draft !== null ? (
          <>
            <Button
              label="Report defect to dispatch"
              variant="danger"
              icon={AlertTriangle}
              onPress={reportDefect}
              loading={busy}
              locked={draftIncomplete}
              lockCopy={
                draftIncomplete
                  ? 'Describe the defect before you can report it'
                  : null
              }
              block
            />
            <Button
              label="Message dispatch"
              variant="secondary"
              icon={MessageSquare}
              onPress={openChat}
              block
              style={styles.second}
            />
          </>
        ) : (
          <Button
            label="Start job"
            icon={Play}
            onPress={startJob}
            loading={busy}
            locked={!gate?.satisfied}
            lockCopy={
              gate?.satisfied
                ? job?.inspection?.loggedByLabel ?? null
                : gate?.lockCopy ?? null
            }
            block
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  // `.scrl { padding:16px 18px 96px }` — the 96 cleared the frame's absolute
  // `.btnbar`; here the bar is a flex sibling, so only breathing room is left.
  scrl: {
    paddingTop: spacing.screenV,
    paddingHorizontal: spacing.screenH,
    paddingBottom: 20,
  },
  retry: { marginTop: 12 },
  stepper: { marginBottom: 16 },
  units: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  toast: { marginBottom: 14 },
  // `.sect-lbl` with the frame's `margin-left:0; margin-top:0` overrides.
  sectLabel: {
    ...text(700, 12, 0.5),
    color: colors.text2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  btnbar: {
    paddingTop: chrome.btnBarPadding.top,
    paddingHorizontal: chrome.btnBarPadding.horizontal,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  second: { marginTop: 10 },
});
