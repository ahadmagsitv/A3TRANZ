import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Briefcase,
  Home,
  MessageSquare,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { chrome, colors, iconSize, radii } from '../theme/tokens';
import { text } from '../theme/typography';
import { HomeScreen } from '../features/home';
import { JobsScreen } from '../features/jobs';
import { NotificationsScreen } from '../features/alerts';
import { ChatsScreen } from '../features/chat';
import { ProfileScreen } from '../features/profile';
import { useUnreadAlerts, useUnreadChat } from '../hooks/useUnreadBadges';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

interface IconProps {
  color: string;
  focused: boolean;
}

/**
 * `.tb svg { width:25px }` · `.tb.on svg { color:--sel; stroke-width:2.4 }`.
 *
 * Hoisted out of render: an inline `tabBarIcon` arrow is a new component type
 * on every render, so React tears down and rebuilds each icon subtree.
 */
const tabIcon =
  (Glyph: LucideIcon) =>
  ({ color, focused }: IconProps) =>
    (
      <Glyph
        size={iconSize.tab}
        color={color}
        strokeWidth={focused ? 2.4 : 2}
      />
    );

/**
 * §6.8 — the Chat and Alerts tabs carry a dot while anything is unread.
 *
 * The dot is a boolean read straight off the mock store's one selector, so
 * opening a thread or a notification clears it in the same tick the list row
 * loses its badge. The icon subscribes itself rather than taking the flag as a
 * prop: that keeps its component identity stable across every navigator
 * render, which is what stops the tab bar remounting its icons.
 */
const badgedIcon = (Glyph: LucideIcon, useDot: () => boolean) =>
  function BadgedTabIcon({ color, focused }: IconProps) {
    const dot = useDot();
    return (
      <View>
        <Glyph
          size={iconSize.tab}
          color={color}
          strokeWidth={focused ? 2.4 : 2}
        />
        {dot ? <View style={styles.dot} /> : null}
      </View>
    );
  };

const HomeIcon = tabIcon(Home);
const JobsIcon = tabIcon(Briefcase);
const AlertsIcon = badgedIcon(Bell, useUnreadAlerts);
const ChatIcon = badgedIcon(MessageSquare, useUnreadChat);
const ProfileIcon = tabIcon(User);

/**
 * `.tbar` — FIVE tabs, fixed, in this order (§4.1).
 *
 * 84px tall, `padding: 10px 6px 24px`, 25px glyphs, active = `--sel` blue.
 * Present on exactly nine frames (M18, M4, M4-empty, M5, M6, M27, M14,
 * M14-empty, M15); every other screen is a stack push. The 24px bottom is the
 * home-indicator gutter, so on a device with a deeper inset the bar grows by
 * the difference rather than clipping into the gesture pill.
 */
export const TabNavigator = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const extra = Math.max(0, insets.bottom - chrome.tabBarPadding.bottom);
  /* Same two selectors the icons read — here only so the tab announces WHY it
     is dotted. A dot with no label is invisible to a screen reader. */
  const unreadChat = useUnreadChat();
  const unreadAlerts = useUnreadAlerts();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.sel,
        tabBarInactiveTintColor: colors.text2,
        tabBarLabelStyle: styles.label,
        tabBarStyle: [
          styles.bar,
          {
            height: chrome.tabBar + extra,
            paddingBottom: chrome.tabBarPadding.bottom + extra,
          },
        ],
        tabBarItemStyle: styles.item,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: HomeIcon }}
      />
      <Tab.Screen
        name="Jobs"
        component={JobsScreen}
        options={{ tabBarIcon: JobsIcon }}
      />
      <Tab.Screen
        name="Alerts"
        component={NotificationsScreen}
        options={{
          tabBarIcon: AlertsIcon,
          tabBarAccessibilityLabel: unreadAlerts
            ? 'Alerts, unread notifications'
            : 'Alerts',
        }}
      />
      {/* The Chat tab opens the thread LIST, never a single thread (§6.8). */}
      <Tab.Screen
        name="Chat"
        component={ChatsScreen}
        options={{
          tabBarIcon: ChatIcon,
          tabBarAccessibilityLabel: unreadChat
            ? 'Chat, unread messages'
            : 'Chat',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ProfileIcon }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: chrome.tabBarPadding.top,
    paddingHorizontal: chrome.tabBarPadding.horizontal,
  },
  item: { gap: 3 },
  label: { ...text(600, 10, 0.1) },
  /**
   * The unread dot. `--sel` is the same blue the `.bdg` on a chat row and the
   * unread mark on a notification row use, so one glance ties the tab to the
   * row that caused it. The surface ring keeps it legible against the glyph.
   */
  dot: {
    position: 'absolute',
    top: -1,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.sel,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
