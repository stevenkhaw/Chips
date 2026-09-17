import React from 'react';
import { Text, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { colors, fonts } from '@/theme';

function TabIcon({ symbol, glyph, color }: { symbol: SFSymbol; glyph: string; color: ColorValue }) {
  return (
    <SymbolView
      name={symbol}
      tintColor={color}
      size={22}
      fallback={<Text style={{ color, fontSize: 18, lineHeight: 22 }}>{glyph}</Text>}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: 1 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 11 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabIcon symbol="house.fill" glyph="⌂" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <TabIcon symbol="chart.line.uptrend.xyaxis" glyph="⤴" color={color} />,
        }}
      />
    </Tabs>
  );
}
