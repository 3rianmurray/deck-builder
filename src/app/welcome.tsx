import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { SymbolViewProps } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { TabletopSurface } from '../components/Tabletop';
import { Text } from '../components/Text';
import * as haptics from '../lib/haptics';
import { colors } from '../theme';

interface Page {
  icon: SymbolViewProps['name'];
  title: string;
  body: string;
}

const PAGES: Page[] = [
  {
    icon: { ios: 'suit.spade.fill', android: 'style', web: 'style' },
    title: 'Welcome to Shufflevale',
    body: 'Make decks from your own card art, then take them to a table to draw, shuffle and play, just like real cards.',
  },
  {
    icon: { ios: 'photo.on.rectangle.angled', android: 'photo_library', web: 'photo_library' },
    title: 'Make a deck',
    body: 'Tap + New Deck and add card art from the camera, Photos or Files, or cut a whole sprite sheet into cards. Give it a card back too.',
  },
  {
    icon: { ios: 'hand.draw.fill', android: 'pan_tool', web: 'pan_tool' },
    title: 'Play at the table',
    body: 'Drag cards between the deck, the table, your hand and the discard pile. Tap a card for more, like flipping it or seeing it full size. Drag a stack by its count.',
  },
  {
    icon: { ios: 'arrow.uturn.backward.circle.fill', android: 'undo', web: 'undo' },
    title: 'Draw, shuffle, undo',
    body: 'Draw, Shuffle and Search sit by the deck. While you hold a card, a flip button takes their place. Made a mistake? Undo is at the top right.',
  },
  {
    icon: { ios: 'square.stack.3d.up.fill', android: 'layers', web: 'layers' },
    title: 'Keep it organised',
    body: 'Start a session to play several decks at once. On the home screen, hold a deck to move it or file it in a group, swipe right to copy it, or left to delete it.',
  },
];

/**
 * The welcome: a few swipeable pages on how the app works. Shown by itself on the first launch, and again any
 * time from the home screen's help button. Skip leaves at once.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = page === PAGES.length - 1;

  const close = () => router.back();
  const next = () => {
    if (last) return close();
    pager.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  return (
    <View style={styles.screen}>
      <TabletopSurface />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={close}
          hitSlop={12}
          accessibilityRole="button"
          // Out of the way (but still there for screen readers) on the last page, where Get started does the same.
          style={({ pressed }) => [styles.skip, (pressed || last) && { opacity: last ? 0 : 0.6 }]}
          disabled={last}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const at = Math.round(e.nativeEvent.contentOffset.x / width);
          if (at !== page && at >= 0 && at < PAGES.length) {
            setPage(at);
            // A tick as each page settles into view.
            haptics.tick();
          }
        }}>
        {PAGES.map((p) => (
          <View key={p.title} style={[styles.page, { width }]}>
            <View style={styles.badge}>
              <SymbolView name={p.icon} size={56} tintColor={colors.accentText} />
            </View>
            <Text style={styles.title}>{p.title}</Text>
            <Text style={styles.body}>{p.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`}>
          {PAGES.map((p, i) => (
            <View key={p.title} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>
        <Button label={last ? 'Get started' : 'Next'} variant="primary" onPress={next} style={styles.next} />
      </View>
    </View>
  );
}

const BADGE = 120;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.felt },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20 },
  skip: { paddingVertical: 6, paddingHorizontal: 4 },
  skipText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 18 },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  body: { color: colors.text, opacity: 0.85, fontSize: 17, lineHeight: 24, textAlign: 'center' },
  bottom: { paddingHorizontal: 24, gap: 20, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotOn: { backgroundColor: colors.accent, width: 22 },
  next: { alignSelf: 'stretch' },
});
