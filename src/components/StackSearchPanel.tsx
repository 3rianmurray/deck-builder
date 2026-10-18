import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
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
            return deck ? <CardView deck={deck} card={cardOf(item)} width={cardWidth} /> : null;
          }}
          renderLifted={(item) => {
            const deck = deckOf(item);
            return deck ? <CardView deck={deck} card={cardOf(item)} width={cardWidth} sharp /> : null;
          }}
          onPress={(item) => {
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
        {/* A tap while holding cards is handled above (it takes them out), so here it just closes. */}
        <Button label="Close" onPress={() => !holding && onClose()} />
      </View>

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
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, flex: 1 },
});
