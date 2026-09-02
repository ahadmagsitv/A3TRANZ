import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrandMark } from '../../../components';
import { authRepo } from '../../../data/repos';
import { colors, splash } from '../../../theme/tokens';
import { display } from '../../../theme/typography';
import type { AuthStackParamList, RootStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Splash'>;

/** Minimum time on screen so the `slide` and `breathe` loops actually read. */
const MIN_DWELL_MS = 1600;

/**
 * `M1-launch` — the only frame with no inbound edge (§7 gate 11).
 *
 * The gallery draws it inside a phone bezel with `.island`, `.sbar` and
 * `.hind`. All three are the *illustration* of a phone and are dropped; the
 * real status bar switches to light content because `M1`'s `.sbar` is `#fff`.
 *
 * "SYNCING JOBS" is not decoration — this screen resolves the persisted
 * session and routes: a live session goes straight to the tabs, otherwise M2.
 */
export const SplashScreen = ({ navigation }: Props): React.JSX.Element => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const breathe = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(breathe, {
            toValue: 0,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.timing(slide, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ),
    ];
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [breathe, slide]);

  useEffect(() => {
    let alive = true;
    const dwell = new Promise<void>(resolve => {
      setTimeout(resolve, MIN_DWELL_MS);
    });

    Promise.all([authRepo.current(), dwell])
      .then(([session]) => {
        if (!alive) {
          return;
        }
        if (session) {
          navigation
            .getParent<NativeStackScreenProps<RootStackParamList>['navigation']>()
            ?.reset({ index: 0, routes: [{ name: 'App' }] });
        } else {
          navigation.replace('Login');
        }
      })
      // A session that cannot be read is a signed-out session, not a crash.
      .catch(() => {
        if (alive) {
          navigation.replace('Login');
        }
      });

    return () => {
      alive = false;
    };
  }, [navigation]);

  /** The two 1px `--sel` line gradients at a 40px pitch. */
  const grid = useMemo(() => {
    const { gridPitch } = splash;
    const cols = Math.ceil(width / gridPitch) + 1;
    const rows = Math.ceil(height / gridPitch) + 1;
    return {
      xs: Array.from({ length: cols }, (_, i) => i * gridPitch),
      ys: Array.from({ length: rows }, (_, i) => i * gridPitch),
    };
  }, [width, height]);

  /** `.hind` sits 8px off the frame bottom; on device that gutter is the inset. */
  const gutter = Math.max(insets.bottom, 8);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      <View style={styles.grid} pointerEvents="none">
        <Svg width={width} height={height}>
          {grid.ys.map(y => (
            <Line
              key={`h${y}`}
              x1={0}
              y1={y}
              x2={width}
              y2={y}
              stroke={colors.sel}
              strokeWidth={1}
            />
          ))}
          {grid.xs.map(x => (
            <Line
              key={`v${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={height}
              stroke={colors.sel}
              strokeWidth={1}
            />
          ))}
        </Svg>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            left: width / 2 - splash.glowSize / 2,
            top: height * splash.glowTop - splash.glowSize / 2,
            opacity: breathe.interpolate({
              inputRange: [0, 1],
              outputRange: [0.75, 1],
            }),
            transform: [
              {
                scale: breathe.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.1],
                }),
              },
            ],
          },
        ]}
      >
        <Svg width={splash.glowSize} height={splash.glowSize}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              {splash.glowStops.map(s => (
                <Stop
                  key={s.offset}
                  offset={s.offset}
                  stopColor={colors.sel}
                  stopOpacity={s.opacity}
                />
              ))}
            </RadialGradient>
          </Defs>
          <Circle
            cx={splash.glowSize / 2}
            cy={splash.glowSize / 2}
            r={splash.glowSize / 2}
            fill="url(#glow)"
          />
        </Svg>
      </Animated.View>

      <View style={styles.lockup} pointerEvents="none">
        <BrandMark variant="lockup" />
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Syncing jobs"
        style={[styles.track, { bottom: gutter + 84 }]}
      >
        <Animated.View
          style={[
            styles.bar,
            {
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [splash.barFrom, splash.barTo],
                  }),
                },
              ],
            },
          ]}
        />
      </View>

      <Text style={[styles.caption, { bottom: gutter + 50 }]}>
        SYNCING JOBS · V1.0.4
      </Text>
    </View>
  );
};

/** `StyleSheet.absoluteFillObject` was dropped from RN 0.87's generated types. */
const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.navyDeep },
  grid: { ...fill, opacity: splash.gridOpacity },
  glow: { position: 'absolute' },
  lockup: {
    ...fill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 24,
  },
  track: {
    position: 'absolute',
    alignSelf: 'center',
    width: splash.trackWidth,
    height: splash.trackHeight,
    borderRadius: splash.trackHeight,
    overflow: 'hidden',
    backgroundColor: splash.track,
  },
  bar: {
    width: splash.barWidth,
    height: '100%',
    borderRadius: splash.trackHeight,
    backgroundColor: colors.sel,
  },
  caption: {
    position: 'absolute',
    alignSelf: 'center',
    ...display(600, 10, 2.5),
    color: splash.caption,
  },
});
