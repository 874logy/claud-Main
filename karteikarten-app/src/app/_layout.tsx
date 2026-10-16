import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Platform, useColorScheme } from 'react-native';

import { initDatabase } from '../lib/db';
import { useColors } from '../lib/theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: c.bg, card: c.surface, text: c.text, border: c.line, primary: c.accent },
  };

  return (
    <SQLiteProvider databaseName="karteikarten.db" onInit={initDatabase}>
      <ThemeProvider value={theme}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerTintColor: c.accent, headerTitleStyle: { color: c.text } }}>
          <Stack.Screen
            name="index"
            options={{ title: 'Karteikarten', headerLargeTitle: Platform.OS === 'ios', headerShadowVisible: false }}
          />
          <Stack.Screen name="deck/new" options={{ title: 'Neuer Stapel', presentation: 'modal' }} />
          <Stack.Screen name="deck/[id]/index" options={{ title: '' }} />
          <Stack.Screen name="deck/[id]/card" options={{ title: 'Karte', presentation: 'modal' }} />
          <Stack.Screen name="deck/[id]/study" options={{ title: 'Lernen' }} />
        </Stack>
      </ThemeProvider>
    </SQLiteProvider>
  );
}
