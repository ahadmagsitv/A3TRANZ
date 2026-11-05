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

export const TabNavigator = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const extra = Math.max(0, insets.bottom - chrome.tabBarPadding.bottom);
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
