import React from 'react';
import { Tabs } from 'expo-router';
import { Text, StyleSheet, View } from 'react-native';
import { colors, fontSize } from '../../src/utils/theme';

function TabIcon({ label, emoji, focused }: { label: string; emoji: string; focused: boolean }) {
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.emoji, focused && styles.emojiActive]}>{emoji}</Text>
      <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Dashboard" emoji="📊" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="hydration"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Sip" emoji="💧" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="movement"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Flow" emoji="🧘" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="eyes"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Focus" emoji="👁️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: 80,
    paddingTop: 8,
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 22,
    marginBottom: 2,
    opacity: 0.6,
  },
  emojiActive: {
    opacity: 1,
  },
  label: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  labelActive: {
    color: colors.primary,
  },
});
