import React, { useEffect, useState } from 'react';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import { openExpoDb } from '@/db/expo-adapter';
import { migrate } from '@/db/schema';
import { setDb } from '@/db/connection';
import { reloadAll } from '@/store/houseActions';
import { colors, textStyles } from '@/theme';

/**
 * Navigation theme. expo-router paints the native stack container (the
 * UINavigationController view seen behind screens during a swipe-back) with
 * `colors.background`; without this it falls back to the light DefaultTheme.
 */
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
  },
};

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If a font fails to download, React Native falls back to the system face for
  // that family; the app still renders, so we never block on fontError.
  const [fontsLoaded, fontError] = useFonts({
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
  });

  useEffect(() => {
    try {
      const db = openExpoDb();
      migrate(db);
      setDb(db);
      reloadAll();
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (fontError) console.warn('Font load failed, falling back to system fonts:', fontError);
  }, [fontError]);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ ...textStyles.bodyLg, color: colors.neg }}>Failed to open database: {error}</Text>
      </View>
    );
  }
  if (!ready || (!fontsLoaded && !fontError)) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
