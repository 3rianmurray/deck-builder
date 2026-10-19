import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { NamePrompt } from '../components/NamePrompt';
import { TipToast } from '../components/TipToast';
import { TourOverlay } from '../components/TourOverlay';
import { DecksProvider } from '../lib/DecksContext';
import { colors } from '../theme';

export default function RootLayout() {
  return (
    // For swipeable rows (see SwipeRow).
    <GestureHandlerRootView style={{ flex: 1 }}>
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
          }}
        >
          <Stack.Screen name="index" options={{ title: 'My Decks' }} />
          {/* No swipe-back: dragging a card to reorder it would leave the screen instead (see play/[id]). */}
          <Stack.Screen name="deck/[id]" options={{ title: 'Edit Deck', gestureEnabled: false }} />
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
          <Stack.Screen name="sandbox/new" options={{ title: 'New Table' }} />
          <Stack.Screen name="help" options={{ title: 'Help' }} />
          <Stack.Screen name="about" options={{ title: 'About' }} />
          {/* Its own top bar, and sideways swipes there move cards and the camera, not the screen. */}
          <Stack.Screen name="sandbox/[id]" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack>
        {/* The walkthrough, over every screen. */}
        <TourOverlay />
        {/* The prompt for naming things, over every screen. */}
        <NamePrompt />
        {/* Now-and-then tips, over every screen. */}
        <TipToast />
      </DecksProvider>
    </GestureHandlerRootView>
  );
}
