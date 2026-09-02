import React, { memo } from 'react';
import {
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, tint } from '../theme/tokens';
import { display, text } from '../theme/typography';
import { shadowSheet } from '../theme/shadows';

/**
 * `.sheet` + `.scrim-bg` — a bottom sheet.
 *
 * Rendered as an RN `<Modal>`, not a route: it is reached from several stacks
 * and must sit above the tab bar. §8 Q8 — the tab bar stays MOUNTED behind the
 * scrim (real-app behaviour); unmounting it causes a layout jump.
 */
export const Sheet = memo(function Sheet({
  visible,
  onDismiss,
  title,
  body,
  children,
}: {
  visible: boolean;
  onDismiss: () => void;
  title?: string;
  body?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [visible, onDismiss]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={styles.scrim}
        onPress={onDismiss}
      />
      <View
        style={[
          styles.sheet,
          { paddingBottom: 28 + Math.max(insets.bottom - 8, 0) },
        ]}
      >
        <View style={styles.grabber} />
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {body ? <Text style={styles.body}>{body}</Text> : null}
        {children}
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tint.scrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.r3,
    borderTopRightRadius: radii.r3,
    paddingTop: 8,
    paddingHorizontal: 20,
    ...shadowSheet,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.muted,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  title: { ...display(800, 18), color: colors.text, marginBottom: 6 },
  body: {
    ...text(500, 14),
    color: colors.text2,
    lineHeight: 20,
    marginBottom: 16,
  },
});
