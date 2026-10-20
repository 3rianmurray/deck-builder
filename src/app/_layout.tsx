import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { NamePrompt } from '../components/NamePrompt';
import { TipToast } from '../components/TipToast';
import { TourOverlay } from '../components/TourOverlay';
import { DecksProvider } from '../lib/DecksContext';
import { startPro } from '../lib/pro';
import { colors } from '../theme';

/**
 * The navigator's own colors: dark, as the app is. Its default (light) theme paints what's behind the screens, which
 * showed as white at a screen's rounded corners while it slid in or out.
 */
const NAV_THEME = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, primary: colors.accent, border: colors.bg },
};

export default function RootLayout() {
  // The App Store, for Shufflevale Pro: its price, and whether it's owned (see lib/pro).
  useEffect(() => {
    void startPro();
  }, []);
  return (
    // For swipeable rows (see SwipeRow).
    // The app's dark background right at the root, so nothing light shows round a screen's corners as it slides.
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={NAV_THEME}>
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
          <Stack.Screen name="pro" options={{ title: 'Pro', presentation: 'modal' }} />
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
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
