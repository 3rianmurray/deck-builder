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
          // Just the back arrow, not the previous screen's title (e.g. "My Decks"), which crowded the header.
          headerBackButtonDisplayMode: 'minimal',
        }}>
        <Stack.Screen name="index" options={{ title: 'My Decks' }} />
        <Stack.Screen name="deck/[id]" options={{ title: 'Edit Deck' }} />
        {/*
          Swipe-back is off while playing: since iOS 26 it works from anywhere on screen, so dragging a card sideways
          would leave the table. The table draws its own top bar (with a back button) over the felt, so no header.
        */}
        <Stack.Screen
          name="play/[id]"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="session/[id]"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen name="session/edit" options={{ title: 'Session' }} />
      </Stack>
    </DecksProvider>
  );
}
