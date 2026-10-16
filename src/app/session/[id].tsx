import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { DeckTable } from '../../components/PlayTable';
import { TableTopBar } from '../../components/TableTopBar';
import type { TableControls } from '../../components/TableTopBar';
import { TabletopSurface } from '../../components/Tabletop';
import * as haptics from '../../lib/haptics';
import { useDecks } from '../../lib/DecksContext';
import { colors } from '../../theme';

/**
 * Plays several decks at once: tap a deck's tab to move to it. (Not by swiping: sideways swipes on the table are
 * for its cards and its hand, and iOS couldn't be stopped in time from turning them into page swipes.)
 */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getSession, getDeck } = useDecks();
  const { width, fontScale } = useWindowDimensions();
  // The tabs' height: their text's line at the phone's text size (up to the most it grows), with space round it.
  const tabHeight = Math.ceil(TAB_LINE * Math.min(fontScale, MAX_TEXT_SCALE)) + TAB_PAD;
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  /** The deck on screen's name, menu and undo, for the top bar. */
  const [controls, setControls] = useState<TableControls | null>(null);

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
      <View style={styles.felt}>
        <TableTopBar controls={null} />
        <View style={[styles.felt, styles.center]}>
        <Text style={styles.muted}>{session ? 'This session has no decks left.' : 'This session no longer exists.'}</Text>
        {session ? (
          <Pressable onPress={() => router.push({ pathname: '/session/edit', params: { id: session.id } })} hitSlop={12}>
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
    pager.current?.scrollTo({ x: i * width, animated: true });
  };

  return (
    <View style={styles.felt}>
      {/* The cloth runs under the top bar and the tabs too, as one surface. */}
      <TabletopSurface />
      <TableTopBar controls={controls} />
      <View>
        {/* Sized from the text size setting, so changing it (even while the app is open) re-fits the row: the pills
            stay centred in it and it can't be nudged up and down. */}
        <ScrollView
          // Rebuilt when the text size changes: iOS keeps the old text measurements otherwise, leaving names off centre.
          key={fontScale}
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
              <Text style={[styles.tabText, i === current && { color: colors.accentText }]} numberOfLines={1} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
                {d.name}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push({ pathname: '/session/edit', params: { id: session.id } })}
            disabled={!!controls?.busy}
            accessibilityLabel="Edit session"
            style={[styles.tab, { height: tabHeight }]}>
            <Text style={styles.tabText} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
              Edit
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        // Moved only by the tabs (see above).
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}>
        {decks.map((d, i) => (
          <View key={d.id} style={{ width }}>
            <DeckTable
              deckId={d.id}
              sessionId={session.id}
              active={i === current}
              onControls={setControls}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** The tabs' text, its line at the standard text size, and how far it grows with the text size setting at most. */
const TAB_TEXT = 14;
const TAB_LINE = 18;
const MAX_TEXT_SCALE = 1.6;
/** Space round a tab's text, and under the row. */
const TAB_PAD = 14;
const TABS_BOTTOM = 8;

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
