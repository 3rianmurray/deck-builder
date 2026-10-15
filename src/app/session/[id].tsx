import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { DeckTable } from '../../components/PlayTable';
import * as haptics from '../../lib/haptics';
import { useDecks } from '../../lib/DecksContext';
import { colors } from '../../theme';

/** Plays several decks at once: swipe sideways (or tap a tab) to move between them. */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getSession, getDeck } = useDecks();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  // The pager holds still while a finger is on a card, so dragging a card sideways doesn't change deck.
  const [touchingCard, setTouchingCard] = useState(false);

  const tabsRef = useRef<ScrollView>(null);
  // Where each tab sits in the tab row, so the row can scroll the current one into view.
  const [tabLayouts, setTabLayouts] = useState<Record<number, { x: number; w: number }>>({});

  const session = getSession(id);
  const decks = (session?.deckIds ?? []).flatMap((deckId) => getDeck(deckId) ?? []);
  const current = Math.max(0, Math.min(index, decks.length - 1));

  // Keep the current deck's tab centred, so swiping to a deck far along the row doesn't leave its tab off screen.
  const currentTab = tabLayouts[current];
  useEffect(() => {
    if (!currentTab) return;
    tabsRef.current?.scrollTo({ x: Math.max(0, currentTab.x + currentTab.w / 2 - width / 2), animated: true });
  }, [currentTab, width]);

  if (!session || decks.length === 0) {
    return (
      <View style={[styles.felt, styles.center]}>
        <Text style={styles.muted}>{session ? 'This session has no decks left.' : 'This session no longer exists.'}</Text>
        {session ? (
          <Pressable onPress={() => router.push({ pathname: '/session/edit', params: { id: session.id } })} hitSlop={12}>
            <Text style={styles.link}>Choose decks</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const goTo = (i: number) => {
    if (i !== index) haptics.tick();
    setIndex(i);
    pager.current?.scrollTo({ x: i * width, animated: true });
  };

  return (
    <View style={styles.felt}>
      <View style={styles.tabsBar}>
        <ScrollView ref={tabsRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {decks.map((d, i) => (
            <Pressable
              key={d.id}
              onLayout={(e) => {
                const { x, width: w } = e.nativeEvent.layout;
                setTabLayouts((all) => (all[i]?.x === x && all[i]?.w === w ? all : { ...all, [i]: { x, w } }));
              }}
              onPress={() => goTo(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: i === current }}
              style={[styles.tab, i === current && styles.tabActive]}>
              <Text style={[styles.tabText, i === current && { color: colors.accentText }]} numberOfLines={1}>
                {d.name}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push({ pathname: '/session/edit', params: { id: session.id } })}
            accessibilityLabel="Edit session"
            style={styles.tab}>
            <Text style={styles.tabText}>Edit</Text>
          </Pressable>
        </ScrollView>
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        scrollEnabled={!touchingCard}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          // A tick on arriving at another deck.
          if (i !== index) haptics.tick();
          setIndex(i);
        }}>
        {decks.map((d, i) => (
          <View key={d.id} style={{ width }}>
            <DeckTable deckId={d.id} sessionId={session.id} active={i === current} onTouchingCard={setTouchingCard} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  felt: { flex: 1, backgroundColor: colors.felt },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: colors.textMuted },
  link: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  tabsBar: { backgroundColor: colors.feltDark, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.4)' },
  tabs: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', maxWidth: 180 },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
