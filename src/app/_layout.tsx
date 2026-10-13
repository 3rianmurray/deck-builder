import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { DecksProvider } from '../lib/DecksContext';
import { colors } from '../theme';

export default function RootLayout() {
  return (
    <DecksProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="index" options={{ title: 'My Decks' }} />
        <Stack.Screen name="deck/[id]" options={{ title: 'Edit Deck' }} />
        <Stack.Screen name="play/[id]" options={{ title: 'Table', headerStyle: { backgroundColor: colors.feltDark } }} />
      </Stack>
    </DecksProvider>
  );
}
