import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as haptics from '../lib/haptics';
import { offerTipSoon } from '../lib/tips';
import { pieceName, pieceSizeOf } from '../lib/sandbox';
import type { SandboxCard, TablePiece } from '../lib/sandbox';
import type { Deck } from '../lib/types';
import { colors } from '../theme';
import { ActionSheet } from './ActionSheet';
import type { SheetAction } from './ActionSheet';
import { Button } from './Button';
import { CardView } from './CardView';
import { CardZoom } from './CardZoom';
import { ReorderableGrid } from './ReorderableGrid';
import { TablePieceView } from './TablePieceView';
import type { GridHold } from './ReorderableGrid';
import { Text } from './Text';

/** How long the search takes to slide up over the table, and away again. */
const IN_MS = 240;
const OUT_MS = 180;
const COLUMNS = 4;

/** Something being searched through: a card, or (in a bag) a piece. Its key is the card's instance or the piece's id. */
export interface SearchEntry {
  key: string;
  card?: SandboxCard;
  piece?: TablePiece;
}

/**
 * Looking through a stack (or a bag) on a table, as a deck's search did: everything in it, top first and face up,
 * slid up over the table (a layer of it, not a separate window, so a drag can carry on out of it onto the table).
 *
 * - Tap a card for its options.
 * - Hold a card to pick it up and drag it to another place in the stack; tap more with a second finger to carry
 *   several.
 * - While holding cards, tap Close with another finger to take them out: the search gets out of the way and they
 *   carry on as a drag over the table, to drop anywhere (see `onTakeOut`).
 */
export function StackSearchPanel({
  title,
  entries: cards,
  decks,
  visible,
  leaving,
  noun = ['card', 'cards'],
  canTakeOut = true,
  onReorder,
  onTakeOut,
  cardActions,
  pickActions,
  onClose,
  onClosed,
}: {
  title: string;
  /** What's in it, top first. */
  entries: SearchEntry[];
  /** What to call one of them, and several. */
  noun?: [string, string];
  /** Held ones can be taken out onto the table (by tapping Close with another finger): cards from a stack. */
  canTakeOut?: boolean;
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
    if (!held || !canTakeOut) return;
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
        held.picked.map((i) => cards[i]?.key).filter((key): key is string => !!key),
        finger,
      );
    });
  };

  useEffect(() => {
    if (visible) {
      // A tip, the first time: taking cards out.
      if (canTakeOut) offerTipSoon('search-take-out', 1200);
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
  const selectedEntry = selected ? cards.find((c) => c.key === selected) : undefined;
  const selectedCard = selectedEntry?.card;
  const deckOf = (c: SandboxCard) => decks.get(c.deckId);
  const cardOf = (c: SandboxCard) => deckOf(c)?.cards.find((k) => k.id === c.cardId);

  /** How a thing looks in the grid: a card face up, or a piece shrunk to fit a card's room. */
  const thumb = (entry: SearchEntry, lifted: boolean) => {
    if (entry.card) {
      const deck = deckOf(entry.card);
      return deck ? <CardView deck={deck} card={cardOf(entry.card)} width={cardWidth} sharp={lifted} /> : null;
    }
    if (!entry.piece) return null;
    const own = pieceSizeOf({ ...entry.piece, scale: 1 });
    const room = cardWidth * 1.2;
    const fit = Math.min(1, (cardWidth * 0.86) / own.w, (room * 0.86) / own.h);
    return (
      <View style={{ width: cardWidth, height: room, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: own.w, height: own.h, transform: [{ scale: fit }] }}>
          <TablePieceView piece={{ ...entry.piece, x: own.w / 2, y: own.h / 2, scale: 1 }} />
        </View>
      </View>
    );
  };

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
        <Text style={styles.hint}>{canTakeOut ? 'Tap for options · Hold to move · Hold and tap Close to take out' : 'Tap for options · Hold to move'}</Text>
      </View>
      {cards.length ? (
        <ReorderableGrid
          items={cards}
          keyOf={(c) => c.key}
          columns={COLUMNS}
          itemWidth={cardWidth}
          gap={8}
          padding={16}
          renderItem={(item) => {
            const look = thumb(item, false);
            return look ? (
              <View>
                {look}
                {selecting ? (
                  <View style={[styles.tick, picked.includes(item.key) && styles.ticked]}>
                    {picked.includes(item.key) ? <Text style={styles.tickMark}>✓</Text> : null}
                  </View>
                ) : null}
              </View>
            ) : null;
          }}
          renderLifted={(item) => thumb(item, true)}
          onPress={(item) => {
            // Selecting: a tap ticks it (or unticks it). Otherwise, its own options.
            if (selecting) {
              setPicked((p) => (p.includes(item.key) ? p.filter((x) => x !== item.key) : [...p, item.key]));
              haptics.tick();
              return;
            }
            setSelected(item.key);
            setSheetOpen(true);
          }}
          onMove={onReorder}
          onHold={setHolding}
          // Holding a ticked card picks up every ticked card (it first, the rest in the stack's order).
          liftWith={(index) => {
            const held = cards[index]?.key;
            if (!selecting || !held || !picked.includes(held)) return [index];
            return [index, ...cards.flatMap((c, i) => (i !== index && picked.includes(c.key) ? [i] : []))];
          }}
        />
      ) : (
        <Text style={styles.empty}>Nothing here.</Text>
      )}
      <View ref={closeRef} style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12 }}>
        {selecting ? (
          <View style={styles.pickRow}>
            <Button
              label={picked.length === cards.length ? 'Deselect All' : 'Select All'}
              onPress={() => setPicked(picked.length === cards.length ? [] : cards.map((c) => c.key))}
              style={{ flex: 1 }}
            />
            <Button
              label={picked.length ? `Move ${picked.length} ${picked.length === 1 ? noun[0] : noun[1]}…` : `Tap ${noun[1]} to pick them`}
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
        title={`${picked.length} ${picked.length === 1 ? noun[0] : noun[1]}`}
        onClose={() => setPickSheetOpen(false)}
        actions={pickActions(cards.filter((c) => picked.includes(c.key)).map((c) => c.key)).map((a) => ({
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
        title={selectedCard ? cardOf(selectedCard)?.name : selectedEntry?.piece ? pieceName(selectedEntry.piece) : undefined}
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
            : selectedEntry
              ? cardActions(selectedEntry.key)
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
