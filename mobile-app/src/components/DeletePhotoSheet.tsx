import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { colors, tint } from '../theme/tokens';
import { display, text } from '../theme/typography';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { Toast } from './Toast';

/**
 * `M20-delete-confirm` — ported verbatim, and reused by every surface that
 * deletes a photo (M8 now, M10/M20/M21/M22 in the capture flow).
 *
 * §6.2: deleting evidence re-opens a gate, so it NEVER happens on one tap. The
 * warning is not decoration — it is the whole reason the sheet exists.
 */
export const DeletePhotoSheet = memo(function DeletePhotoSheet({
  visible,
  /** The slot label ('2 · Seal in hand') or the photo's description. */
  subject,
  /** The `.toast-warn` line. Evidence says what re-opens; a loose photo does not. */
  warning,
  busy = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  subject: string;
  warning: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet visible={visible} onDismiss={onCancel}>
      <View style={styles.head}>
        <View style={styles.well}>
          <Trash2 size={20} color={colors.stOverdue} strokeWidth={2} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title}>Delete this photo?</Text>
          <Text style={styles.subject} numberOfLines={2}>
            {subject}
          </Text>
        </View>
      </View>

      <Toast tone="warn" message={warning} style={styles.toast} />

      <Button
        label="Delete photo"
        variant="danger"
        icon={Trash2}
        loading={busy}
        onPress={onConfirm}
        block
      />
      <Button
        label="Cancel"
        variant="secondary"
        onPress={onCancel}
        block
        style={styles.cancel}
      />
    </Sheet>
  );
});

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  well: {
    width: 44,
    height: 44,
    borderRadius: 11,
    backgroundColor: tint.priHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1, minWidth: 0 },
  title: { ...display(800, 18, -0.3), color: colors.text },
  subject: { ...text(500, 13), color: colors.text2, marginTop: 2 },
  toast: { marginBottom: 16 },
  cancel: { marginTop: 10 },
});
