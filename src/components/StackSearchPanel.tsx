import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as haptics from '../lib/haptics';
import type { SandboxCard } from '../lib/sandbox';
import type { Deck } from '../lib/types';
import { colors } from '../theme';
import { ActionSheet } from './ActionSheet';
import type { SheetAction } from './ActionSheet';
import { Button } from './Button';
import { CardView } from './CardView';
import { CardZoom } from './CardZoom';
import { ReorderableGrid } from './ReorderableGrid';
import type { GridHold } from './ReorderableGrid';
import { Text } from './Text';

/** How long the search takes to slide up over the table, and away again. */
const IN_MS = 240;
const OUT_MS = 180;
const COLUMNS = 4;

/**
 * Looking through a stack on a table, as a deck's search did: every card, top first and face up, slid up over the
 * table (a layer of it, not a separate window, so a drag can carry on out of it onto the table).
 *
 * - Tap a card for its options.
 * - Hold a card to pick it up and drag it to another place in the stack; tap more with a second finger to carry
 *   several.
 * - While holding cards, tap Close with another finger to take them out: the search gets out of the way and they
 *   carry on as a drag over the table, to drop anywhere (see `onTakeOut`).
 */
export function StackSearchPanel({
  title,
  cards,
  decks,
  visible,
  leaving,
  onReorder,
  onTakeOut,
  cardActions,
  pickActions,
  onClose,
  onClosed,
}: {
  title: string;
  /** The stack's cards, top first. */
  cards: SandboxCard[];
  decks: Map<string, Deck>;
  visible: boolean;
  /** Cards have been taken out and are being carried over the table: fade away, but stay until they're dropped. */
  leaving: boolean;
  /** Cards (by place, top first) moved together to start at place `to`. */
  onReorder: (picked: number[], to: number) => void;
  /** Held cards (top first) taken out, the finger still on them at a point on screen. */
  onTakeOut: (iids: string[], finger: { x: number; y: number }) => void;
  /** A card's options. */
  cardActions: (iid: string) => SheetAction[];
  /** What can be done with several cards picked out (Select), listed top first. */
  pickActions: (iids: string[]) => SheetAction[];
  onClose: () => void;
  /** It has finished sliding away. */
  onClosed: () => void;
}) {
  const { width, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [zoomedHere, setZoomedHere] = useState<string | null>(null);
  // Below the screen until measured, so it never peeks in at the wrong place on its first frame.
  const [height, setHeight] = useState(screenHeight);
  const [open] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));
  /** Cards held in the grid, if any: tapping Close then takes them out rather than closing. */
  const [holding, setHolding] = useState<GridHold | null>(null);
  const closeRef = useRef<View>(null);
  /** Picking cards out (Select): a tap ticks a card, and the ticked ones can be moved together. */
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pickSheetOpen, setPickSheetOpen] = useState(false);
  const stopSelecting = () => {
    setSelecting(false);
    setPicked([]);
  };

  // A second finger lifting off Close while the first holds cards: take them out, the first finger still on them.
  const touchEnd = (e: GestureResponderEvent) => {
    const held = holding;
    if (!held) return;
    const tap = e.nativeEvent.changedTouches.find((t) => t.identifier !== held.touchId);
    const holder = e.nativeEvent.touches.find((t) => t.identifier === held.touchId);
    if (!tap || !holder) return;
    // Read now: the event isn't kept.
    const at = { x: tap.pageX, y: tap.pageY };
    const finger = { x: holder.pageX, y: holder.pageY };
    closeRef.current?.measureInWindow((x, y, w, h) => {
      if (at.x < x || at.x > x + w || at.y < y || at.y > y + h) return;
      held.letGo();
      setHolding(null);
      onTakeOut(
        held.picked.map((i) => cards[i]?.iid).filter((iid): iid is string => !!iid),
        finger,
      );
    });
  };

  useEffect(() => {
    if (visible) {
      fade.setValue(1);
      Animated.timing(open, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(open, { toValue: 0, duration: OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        ({ finished }) => finished && onClosed(),
      );
    }
    // Slides on opening and closing only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  useEffect(() => {
    if (leaving) Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: true }).start();
  }, [leaving, fade]);

  const cardWidth = (width - 16 * 2 - 8 * (COLUMNS - 1)) / COLUMNS;
  const selectedCard = selected ? cards.find((c) => c.iid === selected) : undefined;
  const deckOf = (c: SandboxCard) => decks.get(c.deckId);
  const cardOf = (c: SandboxCard) => deckOf(c)?.cards.find((k) => k.id === c.cardId);

  return (
    <Animated.View
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      onTouchEnd={touchEnd}
      style={[
        StyleSheet.absoluteFill,
        styles.screen,
        { paddingTop: insets.top },
        // Out of the way once cards are taken out, though still there: the finger carrying them started here.
        { pointerEvents: leaving || !visible ? 'none' : 'auto', opacity: fade },
        { transform: [{ translateY: open.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] },
      ]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {cards.length ? (
            <Pressable onPress={() => (selecting ? stopSelecting() : setSelecting(true))} hitSlop={10} accessibilityRole="button">
              <Text style={styles.select}>{selecting ? 'Done' : 'Select'}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.hint}>Tap for options · Hold to move · Hold and tap Close to take out</Text>
      </View>
      {cards.length ? (
        <ReorderableGrid
          items={cards}
          keyOf={(c) => c.iid}
          columns={COLUMNS}
          itemWidth={cardWidth}
          gap={8}
          padding={16}
          renderItem={(item) => {
            const deck = deckOf(item);
            return deck ? (
              <View>
                <CardView deck={deck} card={cardOf(item)} width={cardWidth} />
                {selecting ? (
                  <View style={[styles.tick, picked.includes(item.iid) && styles.ticked]}>
                    {picked.includes(item.iid) ? <Text style={styles.tickMark}>✓</Text> : null}
                  </View>
                ) : null}
              </View>
            ) : null;
          }}
          renderLifted={(item) => {
            const deck = deckOf(item);
            return deck ? <CardView deck={deck} card={cardOf(item)} width={cardWidth} sharp /> : null;
          }}
          onPress={(item) => {
            // Selecting: a tap ticks it (or unticks it). Otherwise, its own options.
            if (selecting) {
              setPicked((p) => (p.includes(item.iid) ? p.filter((x) => x !== item.iid) : [...p, item.iid]));
              haptics.tick();
              return;
            }
            setSelected(item.iid);
            setSheetOpen(true);
          }}
          onMove={onReorder}
          onHold={setHolding}
        />
      ) : (
        <Text style={styles.empty}>No cards here.</Text>
      )}
      <View ref={closeRef} style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12 }}>
        {selecting ? (
          <View style={styles.pickRow}>
            <Button
              label={picked.length === cards.length ? 'Deselect All' : 'Select All'}
              onPress={() => setPicked(picked.length === cards.length ? [] : cards.map((c) => c.iid))}
              style={{ flex: 1 }}
            />
            <Button
              label={picked.length ? `Move ${picked.length} ${picked.length === 1 ? 'card' : 'cards'}…` : 'Tap cards to pick them'}
              variant="primary"
              disabled={!picked.length}
              onPress={() => setPickSheetOpen(true)}
              style={{ flex: 1.4 }}
            />
          </View>
        ) : (
          // A tap while holding cards is handled above (it takes them out), so here it just closes.
          <Button label="Close" onPress={() => !holding && onClose()} />
        )}
      </View>

      {/* Where the picked cards go (top first, as the stack has them). */}
      <ActionSheet
        visible={pickSheetOpen}
        title={`${picked.length} ${picked.length === 1 ? 'card' : 'cards'}`}
        onClose={() => setPickSheetOpen(false)}
        actions={pickActions(cards.filter((c) => picked.includes(c.iid)).map((c) => c.iid)).map((a) => ({
          ...a,
          onPress: () => {
            a.onPress();
            stopSelecting();
          },
        }))}
      />

      <ActionSheet
        visible={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setZoomedHere(null);
        }}
        title={selectedCard ? cardOf(selectedCard)?.name : undefined}
        header={
          selectedCard && deckOf(selectedCard) ? (
            <View style={{ alignItems: 'center', marginBottom: 6 }}>
              <CardView deck={deckOf(selectedCard)!} card={cardOf(selectedCard)} width={Math.min(240, width * 0.6)} />
            </View>
          ) : null
        }
        actions={
          selectedCard
            ? [{ label: 'Full size', keepsOpen: true, onPress: () => setZoomedHere(selectedCard.iid) }, ...cardActions(selectedCard.iid)]
            : []
        }
        overlay={
          zoomedHere && selectedCard?.iid === zoomedHere && deckOf(selectedCard) && cardOf(selectedCard) ? (
            <CardZoom
              deck={deckOf(selectedCard)!}
              current={{ key: zoomedHere, card: cardOf(selectedCard)! }}
              area={{ w: width, h: screenHeight }}
              onClose={() => setZoomedHere(null)}
            />
          ) : null
        }
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 4 },
  title: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '700' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  select: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  pickRow: { flexDirection: 'row', gap: 10 },
  tick: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticked: { backgroundColor: colors.accent, borderColor: colors.accent },
  tickMark: { color: colors.accentText, fontSize: 13, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, flex: 1 },
});
