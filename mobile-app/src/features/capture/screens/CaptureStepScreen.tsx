import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera, Check, Hash, MailCheck, Send } from 'lucide-react-native';
import {
  Button,
  DeletePhotoSheet,
  EvidenceField,
  JobHeader,
  PhotoSlot,
  Stepper,
  Toast,
  Topbar,
} from '../../../components';
import { jobsRepo } from '../../../data/repos';
import type {
  EvidenceStep,
  Job,
  PhotoSlot as Slot,
} from '../../../data/contracts';
import { gate, STEP_ORDER } from '../../../data/jobStateMachine';
import { errorMessage, useAsync } from '../../../hooks/useAsync';
import { chrome, colors, spacing } from '../../../theme/tokens';
import { text } from '../../../theme/typography';
import type { AppStackParamList } from '../../../navigation/types';
import { pickPhoto } from '../pickPhoto';

type CaptureRoute = 'ConfirmPickup' | 'ConfirmLoad' | 'ConfirmDelivery';
type Props = NativeStackScreenProps<AppStackParamList, CaptureRoute>;

interface StepSpec {
  step: EvidenceStep;
  title: string;
  /** `.sect-lbl` prefix — "Pickup photos · 1 of 2". */
  sectLabel: string;
  cta: string;
  /** Where the CTA goes once the machine has accepted the advance. */
  next: keyof AppStackParamList;
  /** The frames put pickup/load's toast ABOVE the slots and delivery's BELOW. */
  toastBelow: boolean;
}

const SPEC: Record<CaptureRoute, StepSpec> = {
  ConfirmPickup: {
    step: 'pickup',
    title: 'Confirm pickup',
    sectLabel: 'Pickup photos',
    cta: 'Confirm pickup',
    next: 'ConfirmLoad',
    toastBelow: false,
  },
  ConfirmLoad: {
    step: 'load',
    title: 'Confirm load',
    sectLabel: 'Load photos',
    cta: 'Confirm load',
    next: 'ConfirmDelivery',
    toastBelow: false,
  },
  ConfirmDelivery: {
    step: 'delivery',
    title: 'Confirm delivery',
    sectLabel: 'Delivery photos',
    cta: 'Submit for approval',
    next: 'Submitted',
    toastBelow: true,
  },
};

/**
 * `M20-capturing` · `M20-photos-captured` · `M20-delete-confirm` ·
 * `M21-confirm-load` · `M22-capturing` · `M22-complete`.
 *
 * Steps ②③④ are the same frame three times over: stepper, job identity, a
 * labelled `.pslot` per required shot, a `.btnbar` that is **visible and
 * locked** until the step's gate is met. One screen, three route registrations
 * — a second and third copy would be three places for the gate to drift.
 *
 * What is per-step is data, not layout: how many slots, what they are called,
 * whether a seal number is also required (§8 Q1), and whether the CTA advances
 * or submits. All of that already lives in the state machine.
 */
export const CaptureStepScreen = ({
  navigation,
  route,
}: Props): React.JSX.Element => {
  const { jobId } = route.params;
  const spec = SPEC[route.name];
  const insets = useSafeAreaInsets();

  const {
    data: job,
    loading,
    error: loadError,
    reload,
  } = useAsync<Job | null>(() => jobsRepo.get(jobId), [jobId]);

  /**
   * The seal is edited live so the button re-locks the moment the field is
   * cleared, but the RULE stays in `gate()` — this value is handed to the
   * machine, never compared against here (§8 Q1).
   */
  const [seal, setSeal] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sealValue = seal ?? job?.sealNo ?? '';
  const slots = job?.evidence[spec.step] ?? [];
  const filled = slots.filter(s => s.uri !== null).length;

  // Everything the button does is decided by the machine, on the job as the
  // driver has it right now — including a seal typed but not yet committed.
  const g = job
    ? gate({ ...job, sealNo: sealValue }, spec.step)
    : { filled: 0, required: 0, satisfied: false, lockCopy: null };

  /**
   * The step is behind the driver: either already confirmed, or the whole
   * closeout is with the office. The button stays VISIBLE and locked — a CTA
   * that vanishes leaves the driver with no explanation (§6.1).
   */
  const settled =
    job !== null &&
    (job.status === 'awaiting_approval' ||
      job.status === 'done' ||
      STEP_ORDER.indexOf(job.step) > STEP_ORDER.indexOf(spec.step));

  const locked = !g.satisfied || settled;
  const lockCopy =
    g.lockCopy ??
    (settled
      ? job?.status === 'awaiting_approval' || job?.status === 'done'
        ? 'This closeout is with the office.'
        : `${spec.title} is already confirmed.`
      : null);

  const capture = useCallback(
    (index: number) => {
      setError(null);
      pickPhoto()
        .then(uri =>
          uri === null
            ? null
            : jobsRepo.capturePhoto(jobId, spec.step, index, uri),
        )
        .then(next => {
          if (next) {
            reload();
          }
        })
        .catch((e: unknown) => setError(errorMessage(e)));
    },
    [jobId, spec.step, reload],
  );

  /**
   * §6.2 — deleting evidence re-opens the gate, so it never happens on one tap.
   * `deletePhoto` blanks the slot; `gate()` then re-locks the button on the
   * next render. Nothing here re-locks it by hand.
   */
  const confirmDelete = useCallback(() => {
    if (!pendingDelete) {
      return;
    }
    setBusy(true);
    jobsRepo
      .deletePhoto(jobId, spec.step, pendingDelete.index)
      .then(() => {
        setPendingDelete(null);
        setBusy(false);
        reload();
      })
      .catch((e: unknown) => {
        setError(errorMessage(e));
        setPendingDelete(null);
        setBusy(false);
      });
  }, [pendingDelete, jobId, spec.step, reload]);

  /** ② and ③ advance. ④ submits — and that is where the customer email fires. */
  const proceed = useCallback(() => {
    setBusy(true);
    setError(null);
    const trimmed = sealValue.trim();
    const withSeal =
      spec.step === 'pickup' && trimmed !== job?.sealNo
        ? jobsRepo.setSealNumber(jobId, trimmed)
        : Promise.resolve(null);

    withSeal
      .then(() =>
        spec.step === 'delivery'
          ? jobsRepo.submit(jobId)
          : jobsRepo.advance(jobId, spec.step),
      )
      .then(() => {
        setBusy(false);
        navigation.navigate(spec.next as 'ConfirmLoad', { jobId });
      })
      .catch((e: unknown) => {
        setError(errorMessage(e));
        setBusy(false);
      });
  }, [sealValue, spec, job, jobId, navigation]);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const firstMissing = slots.find(s => s.uri === null);
  const done = g.filled === g.required && g.required > 0;

  /** The frames' copy, verbatim, one line per state. */
  const banner: { tone: 'ok' | 'info' | 'warn'; message: string } | null =
    spec.step === 'delivery'
      ? done
        ? {
            tone: 'warn',
            message:
              'Submitting emails the customer straight away. Only an admin can finalize the job.',
          }
        : firstMissing
        ? {
            tone: 'warn',
            message: `The ${firstMissing.label
              .replace(/^\d+ · /, '')
              .toLowerCase()} photo is still missing — you can’t submit without it.`,
          }
        : null
      : done
      ? {
          tone: 'ok',
          message:
            spec.step === 'pickup'
              ? 'Both pickup photos captured. Pickup can be confirmed.'
              : 'All three load photos captured. Load can be confirmed.',
        }
      : {
          tone: 'info',
          message:
            spec.step === 'pickup'
              ? 'Both pickup photos are required before you leave the terminal.'
              : 'All three load photos are required before the load can be confirmed.',
        };

  const bannerNode = banner ? (
    <Toast
      tone={banner.tone}
      message={banner.message}
      icon={
        spec.step === 'delivery' && done
          ? MailCheck
          : banner.tone === 'info'
          ? Camera
          : undefined
      }
      style={spec.toastBelow ? styles.toastBelow : styles.toastAbove}
    />
  ) : null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Topbar title={spec.title} onBack={goBack} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrl}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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
            <Stepper current={spec.step} style={styles.stepper} />

            <JobHeader
              id={job.id}
              type={job.type}
              title={job.title}
              customerName={job.customerName}
            />

            {error ? (
              <Toast tone="err" message={error} style={styles.toastAbove} />
            ) : null}

            {spec.toastBelow ? null : bannerNode}

            <Text style={styles.sectLabel}>
              {`${spec.sectLabel} · ${filled} of ${slots.length}`}
            </Text>

            {slots.map(slot => (
              <PhotoSlot
                key={slot.index}
                slot={slot}
                onCapture={() => capture(slot.index)}
                onRequestDelete={() => setPendingDelete(slot)}
              />
            ))}

            {spec.toastBelow ? bannerNode : null}

            {spec.step === 'pickup' ? (
              <>
                <Text style={styles.sectLabelSpaced}>Seal number</Text>
                <EvidenceField
                  icon={Hash}
                  label="Seal no."
                  value={sealValue}
                  placeholder="SL-000000"
                  onChangeText={setSeal}
                  /* Short field: dismiss and stay put. Confirming pickup is a
                     separate, deliberate tap (§6.3). */
                  onSubmitEditing={Keyboard.dismiss}
                />
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.btnbar, { paddingBottom: 20 + insets.bottom }]}>
        <Button
          label={spec.cta}
          icon={spec.step === 'delivery' ? Send : Check}
          onPress={proceed}
          loading={busy}
          locked={locked}
          /* Locked NEVER means hidden: the count is the whole affordance. */
          lockCopy={locked ? lockCopy ?? `${g.filled} of ${g.required}` : null}
          block
        />
      </View>

      <DeletePhotoSheet
        visible={pendingDelete !== null}
        subject={pendingDelete?.label ?? ''}
        warning={`Removing it re-opens this step — you can’t ${spec.cta.toLowerCase()} until it is retaken.`}
        busy={busy}
        onConfirm={confirmDelete}
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
  retry: { marginTop: 12 },
  stepper: { marginBottom: 16 },
  toastAbove: { marginBottom: 16 },
  toastBelow: { marginTop: 14 },
  sectLabel: {
    ...text(700, 12, 0.5),
    color: colors.text2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  // `.sect-lbl` keeps its 18px top margin when it follows content.
  sectLabelSpaced: {
    ...text(700, 12, 0.5),
    color: colors.text2,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  btnbar: {
    paddingTop: chrome.btnBarPadding.top,
    paddingHorizontal: chrome.btnBarPadding.horizontal,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
