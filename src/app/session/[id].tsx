import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { DeckTable } from '../../components/PlayTable';
import { TableTopBar } from '../../components/TableTopBar';
import type { TableControls } from '../../components/TableTopBar';
import { TabletopSurface } from '../../components/Tabletop';
import * as haptics from '../../lib/haptics';
import { useDecks } from '../../lib/DecksContext';
import { colors } from '../../theme';
import { MAX_TEXT_SCALE, Text } from '../../components/Text';

/**
 * Plays several decks at once: tap a deck's tab, or swipe sideways, to move to another. A swipe that starts on a card
 * is the card's (dragging it to the discard pile, say), never the deck's; and swiping never leaves for the home screen.
 */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getSession, getDeck } = useDecks();
  const { width, fontScale } = useWindowDimensions();
  // The tabs' height: their text's line at the phone's text size (up to the most it grows), with space round it.
  const tabHeight = Math.ceil(TAB_LINE * Math.min(fontScale, MAX_TEXT_SCALE)) + TAB_PAD;
  // The decks' pager: kept in a box (not a ref) so the swipe, made once, can move it too.
  const [pager] = useState(() => {
    const box: { view: ScrollView | null } = { view: null };
    return {
      attach: (view: ScrollView | null) => {
        Object.assign(box, { view });
      },
      scrollTo: (x: number) => box.view?.scrollTo({ x, animated: true }),
    };
  });
  const [index, setIndex] = useState(0);
  /** The deck on screen's name, menu and undo, for the top bar. */
  const [controls, setControls] = useState<TableControls | null>(null);

  const tabsRef = useRef<ScrollView>(null);
  // Where each tab sits in the tab row, so the row can scroll the current one into view.
  const [tabLayouts, setTabLayouts] = useState<Record<number, { x: number; w: number }>>({});
  /** A finger is on a card (the deck on screen says so as it lands): a swipe then is the card's, not the deck's. */
  const touchingCard = useSharedValue(false);
  const onTouchingCard = useCallback((on: boolean) => touchingCard.set(on), [touchingCard]);
  // Where the swipe is (the deck on screen, how many, how wide a page is), for the swipe (made once).
  const [swipeTo] = useState(() => {
    const box = { at: 0, count: 0, width: 0 };
    return { set: (next: Partial<typeof box>) => Object.assign(box, next), get: () => box };
  });
  /** Where the finger landed, for the swipe (on the UI thread). */
  const swipeStart = useSharedValue({ x: 0, y: 0 });
  /**
   * Swiping sideways between decks. Watched, not claimed, till the finger has gone clearly sideways; never if it
   * started on a card (whose drag it is) or if it's mostly up and down. Let go, it moves to the deck that side (a
   * fair way, or a flick). Nothing past the first or last deck.
   */
  const [swipe] = useState(() => {
    const decide = (dx: number, vx: number) => {
      const { at, count, width: w } = swipeTo.get();
      if (Math.abs(dx) < SWIPE_DISTANCE && Math.abs(vx) < SWIPE_SPEED) return;
      const next = dx < 0 ? at + 1 : at - 1;
      if (next < 0 || next >= count) return;
      haptics.tick();
      setIndex(next);
      pager.scrollTo(next * w);
    };
    return Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((e, manager) => {
        const t = e.changedTouches[0];
        if (e.allTouches.length > 1 || !t) return manager.fail();
        swipeStart.set({ x: t.absoluteX, y: t.absoluteY });
      })
      .onTouchesMove((e, manager) => {
        const t = e.allTouches[0];
        // By now the deck has said whether the finger landed on a card.
        if (!t || touchingCard.value || e.allTouches.length > 1) return manager.fail();
        const dx = t.absoluteX - swipeStart.value.x;
        const dy = t.absoluteY - swipeStart.value.y;
        if (Math.abs(dy) > SWIPE_SLOP && Math.abs(dy) > Math.abs(dx)) return manager.fail();
        if (Math.abs(dx) > SWIPE_SLOP && Math.abs(dx) > Math.abs(dy) * 1.5) manager.activate();
      })
      .onEnd((e) => {
        scheduleOnRN(decide, e.translationX, e.velocityX);
      });
  });
  const session = getSession(id);
  const decks = (session?.deckIds ?? []).flatMap((deckId) => getDeck(deckId) ?? []);
  const current = Math.max(0, Math.min(index, decks.length - 1));

  // Keep the current deck's tab centerd, so swiping to a deck far along the row doesn't leave its tab off screen.
  const currentTab = tabLayouts[current];
  useEffect(() => {
    if (!currentTab) return;
    tabsRef.current?.scrollTo({ x: Math.max(0, currentTab.x + currentTab.w / 2 - width / 2), animated: true });
  }, [currentTab, width]);

  if (!session || decks.length === 0) {
    return (
      <View style={styles.felt}>
        <TableTopBar controls={null} />
        <View style={[styles.felt, styles.center]}>
        <Text style={styles.muted}>{session ? 'This session has no decks left.' : 'This session no longer exists.'}</Text>
        {session ? (
          <Pressable onPress={() => router.push({ pathname: '/session/edit', params: { id: session.id } })} hitSlop={12} accessibilityRole="button">
            <Text style={styles.link}>Choose decks</Text>
          </Pressable>
        ) : null}
        </View>
      </View>
    );
  }

  const goTo = (i: number) => {
    if (i !== index) haptics.tick();
    setIndex(i);
    pager.scrollTo(i * width);
  };
  swipeTo.set({ at: current, count: decks.length, width });

  return (
    <View style={styles.felt}>
      {/* The cloth runs under the top bar and the tabs too, as one surface. */}
      <TabletopSurface />
      <TableTopBar controls={controls} />
      <View>
        {/* Sized from the text size setting, so changing it (even while the app is open) re-fits the row: the pills
            stay centerd in it and it can't be nudged up and down. */}
        <ScrollView
          ref={tabsRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          alwaysBounceVertical={false}
          style={{ height: tabHeight + TABS_BOTTOM }}
          contentContainerStyle={styles.tabs}>
          {decks.map((d, i) => (
            <Pressable
              key={d.id}
              onLayout={(e) => {
                const { x, width: w } = e.nativeEvent.layout;
                setTabLayouts((all) => (all[i]?.x === x && all[i]?.w === w ? all : { ...all, [i]: { x, w } }));
              }}
              onPress={() => goTo(i)}
              // Not while cards are being dragged.
              disabled={!!controls?.busy}
              accessibilityRole="tab"
              accessibilityState={{ selected: i === current }}
              style={[styles.tab, { height: tabHeight }, i === current && styles.tabActive]}>
              <Text style={[styles.tabText, i === current && { color: colors.accentText }]} numberOfLines={1}>
                {d.name}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push({ pathname: '/session/edit', params: { id: session.id } })}
            disabled={!!controls?.busy}
            accessibilityRole="button"
            accessibilityLabel="Edit session"
            style={[styles.tab, { height: tabHeight }]}>
            <Text style={styles.tabText}>Edit</Text>
          </Pressable>
        </ScrollView>
      </View>

      <GestureDetector gesture={swipe}>
      <ScrollView
        ref={(view) => pager.attach(view)}
        horizontal
        pagingEnabled
        // Moved by the tabs, and by swipes that don't start on a card (see swipe).
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}>
        {decks.map((d, i) => (
          <View key={d.id} style={{ width }}>
            <DeckTable
              deckId={d.id}
              sessionId={session.id}
              active={i === current}
              onControls={setControls}
              onTouchingCard={onTouchingCard}
            />
          </View>
        ))}
      </ScrollView>
      </GestureDetector>
    </View>
  );
}

/** The tabs' text, its line at the standard text size, and (it grows with the text size setting up to MAX_TEXT_SCALE). */
const TAB_TEXT = 14;
const TAB_LINE = 18;
/** Space round a tab's text, and under the row. */
const TAB_PAD = 14;
const TABS_BOTTOM = 8;
/** A swipe between decks: how far a finger goes before it counts as sideways, and how far (or fast) to change deck. */
const SWIPE_SLOP = 24;
const SWIPE_DISTANCE = 70;
const SWIPE_SPEED = 500;

const styles = StyleSheet.create({
  felt: { flex: 1, backgroundColor: colors.felt },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: colors.textMuted },
  link: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  tabs: { paddingHorizontal: 12, paddingBottom: TABS_BOTTOM, gap: 8, alignItems: 'center' },
  tab: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 16,
    // The same dark glass as the top bar's buttons.
    backgroundColor: 'rgba(8,18,26,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    maxWidth: 180,
  },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.text, fontSize: TAB_TEXT, fontWeight: '600' },
});
