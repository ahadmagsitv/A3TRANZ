import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import Svg, { Defs, Pattern, Path, Rect } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import { colors, radii } from '../theme/tokens';
import { text } from '../theme/typography';

const GRID = 26;

const EMBED_ORIGIN = 'https://maps.google.com/';

const embedDocument = (query: string): string => {
  const src = `${EMBED_ORIGIN}maps?q=${encodeURIComponent(
    query,
  )}&z=15&output=embed`;
  return [
    '<!doctype html><html><head>',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:transparent}',
    'iframe{display:block;border:0;width:100%;height:100%}</style>',
    '</head><body>',
    `<iframe src="${src}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map"></iframe>`,
    '</body></html>',
  ].join('');
};

export const MapEmbed = memo(function MapEmbed({
  query,
  address,
  height = 150,
}: {
  query?: string | null;
  address: string;
  height?: number;
}) {
  return (
    <View
      accessibilityLabel={`Map of ${address}`}
      style={[styles.map, { height }]}
    >
      {query ? (
        <View style={styles.web} pointerEvents="none">
          <WebView
            scrollEnabled={false}
            style={styles.flex}
            source={{ html: embedDocument(query), baseUrl: EMBED_ORIGIN }}
          />
        </View>
      ) : (
        <>
          <Svg style={StyleSheet.absoluteFill} opacity={0.7}>
            <Defs>
              <Pattern
                id="grid"
                width={GRID}
                height={GRID}
                patternUnits="userSpaceOnUse"
              >
                <Path
                  d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
                  fill="none"
                  stroke={colors.hairline}
                  strokeWidth={1}
                />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#grid)" />
          </Svg>
          <MapPin size={30} color={colors.stOverdue} strokeWidth={2} />
        </>
      )}

      <View style={styles.addr}>
        <MapPin size={16} color={colors.stOverdue} strokeWidth={2} />
        <Text style={styles.addrText} numberOfLines={1}>
          {address}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  map: {
    borderRadius: radii.r2,
    backgroundColor: colors.mapBg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  web: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  flex: { flex: 1 },
  addr: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.r,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  addrText: { ...text(600, 13), color: colors.text, flex: 1 },
});
