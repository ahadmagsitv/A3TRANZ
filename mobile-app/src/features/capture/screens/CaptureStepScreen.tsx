import React, { useCallback, useState } from 'react';
import {
  Alert,
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
import { pickFromLibrary, pickPhoto } from '../pickPhoto';

type CaptureRoute = 'ConfirmPickup' | 'ConfirmLoad' | 'ConfirmDelivery';
type Props = NativeStackScreenProps<AppStackParamList, CaptureRoute>;

interface StepSpec {
  step: EvidenceStep;
  title: string;
  sectLabel: string;
  cta: string;
  next: keyof AppStackParamList;
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

  const [seal, setSeal] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sealValue = seal ?? job?.sealNo ?? '';
  const slots = job?.evidence[spec.step] ?? [];
  const filled = slots.filter(s => s.uri !== null).length;

  const g = job
    ? gate({ ...job, sealNo: sealValue }, spec.step)
    : { filled: 0, required: 0, satisfied: false, lockCopy: null };

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

  const [pending, setPending] = useState<{ index: number; uri: string } | null>(
    null,
  );

  const store = useCallback(
    (index: number, pick: () => Promise<string | null>) => {
      setError(null);
      pick()
        .then(uri => {
          if (uri === null) {
            return null;
          }
          setPending({ index, uri });
          return jobsRepo.capturePhoto(jobId, spec.step, index, uri);
        })
        .then(next => {
          if (next) {
            reload();
          }
        })
        .catch((e: unknown) => setError(errorMessage(e)))
        .finally(() => setPending(null));
    },
    [jobId, spec.step, reload],
  );

  const capture = useCallback(
    (slot: Slot) => {
      if (!slot.allowUpload) {
        store(slot.index, pickPhoto);
        return;
      }
      Alert.alert(slot.label, 'Take a new photo, or upload one you already have.', [
        { text: 'Take photo', onPress: () => store(slot.index, pickPhoto) },
        { text: 'Upload a photo', onPress: () => store(slot.index, pickFromLibrary) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [store],
  );

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
              ? 'Both pickup photos are required before you leave the depot.'
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
                slot={
                  pending?.index === slot.index
                    ? { ...slot, uri: pending.uri }
                    : slot
                }
                busy={pending?.index === slot.index}
                onCapture={() => capture(slot)}
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
