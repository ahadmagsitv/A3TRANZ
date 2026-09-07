import React, { memo, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Download, FileText, X } from 'lucide-react-native';
import { colors, radii } from '../theme/tokens';
import { text } from '../theme/typography';
import type { Message } from '../data/contracts';

/** `.bubble` / `.b-me` / `.b-them` / `.b-att` / `.b-time` */
export const ChatBubble = memo(function ChatBubble({
  message,
}: {
  message: Message;
}) {
  const mine = message.from === 'me';
  const [zoomed, setZoomed] = useState(false);

  const uri = message.attachmentUri;
  const name = message.attachmentName ?? 'Attachment';
  // The stored MIME type, not the file extension: the extension was chosen
  // from that same type, so re-parsing it back out only adds a way to be wrong.
  const isImage = (message.attachmentType ?? '').startsWith('image/');

  /**
   * ponytail: "download" hands the file to the system browser, which is where
   * iOS and Android already know how to save it. Saving into the camera roll
   * directly needs a native module and a photo-library permission, for a file
   * the driver can already keep from Safari.
   */
  const open = (): void => {
    if (uri) {
      void Linking.openURL(uri).catch(() => undefined);
    }
  };

  return (
    <View style={mine ? styles.wrapMe : styles.wrapThem}>
      <View style={[styles.bubble, mine ? styles.me : styles.them]}>
        {uri && isImage ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${name}`}
            onPress={() => setZoomed(true)}
          >
            <Image
              source={{ uri }}
              style={[styles.attachment, message.body ? null : styles.attachmentAlone]}
            />
          </Pressable>
        ) : null}

        {uri && !isImage ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Download ${name}`}
            onPress={open}
            style={[styles.file, message.body ? null : styles.fileAlone]}
          >
            <FileText
              size={17}
              color={mine ? colors.onNavy : colors.text}
              strokeWidth={2}
            />
            <Text
              style={[styles.fileName, mine ? styles.bodyMe : styles.bodyThem]}
              numberOfLines={1}
            >
              {name}
            </Text>
            <Download
              size={15}
              color={mine ? colors.onNavy : colors.text2}
              strokeWidth={2}
            />
          </Pressable>
        ) : null}

        {/* An attachment with no caption is a whole message; an empty line
            under it would just add a gap. */}
        {message.body ? (
          <Text style={[styles.body, mine ? styles.bodyMe : styles.bodyThem]}>
            {message.body}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.time, mine ? styles.timeMe : null]}>
        {message.whenLabel}
      </Text>

      <Modal
        visible={zoomed}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomed(false)}
      >
        <View style={styles.lightbox}>
          <Image
            source={{ uri: uri ?? undefined }}
            style={styles.zoomed}
            resizeMode="contain"
            accessibilityLabel={name}
          />
          <View style={styles.lightboxBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Download"
              onPress={open}
              hitSlop={10}
              style={styles.lightboxBtn}
            >
              <Download size={19} color={colors.onNavy} strokeWidth={2} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setZoomed(false)}
              hitSlop={10}
              style={styles.lightboxBtn}
            >
              <X size={19} color={colors.onNavy} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapMe: { alignSelf: 'flex-end', maxWidth: '78%' },
  wrapThem: { alignSelf: 'flex-start', maxWidth: '78%' },
  bubble: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 16 },
  them: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderBottomLeftRadius: 5,
  },
  me: { backgroundColor: colors.navy, borderBottomRightRadius: 5 },
  body: { ...text(500, 14), lineHeight: 20 },
  bodyThem: { color: colors.text },
  bodyMe: { color: colors.onNavy },
  attachment: {
    width: 190,
    height: 130,
    borderRadius: 10,
    backgroundColor: colors.surface3,
    marginBottom: 8,
  },
  attachmentAlone: { marginBottom: 0 },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 220,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: 'rgba(127,127,127,.18)',
    marginBottom: 8,
  },
  fileAlone: { marginBottom: 0 },
  fileName: { ...text(600, 13), flexShrink: 1 },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  zoomed: { width: '100%', height: '100%' },
  lightboxBar: {
    position: 'absolute',
    top: 54,
    right: 18,
    flexDirection: 'row',
    gap: 10,
  },
  lightboxBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * `.b-time` is `--muted` in the frame; §7 gate 1 forbids `--muted` as copy
   * (2.6:1), so the timestamp takes `--text-2` (5:1). Logged deviation.
   */
  time: { ...text(500, 11), color: colors.text2, marginTop: 4 },
  timeMe: { textAlign: 'right' },
});
