import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as haptics from '../lib/haptics';
import { loadUpright, saveCrop, smallPixels } from '../lib/images';
import { guessSheet } from '../lib/sheetGuess';
import type { LoadedImage, QuarterTurn } from '../lib/images';
import { cellNumber, cellRects } from '../lib/spriteSheet';
import type { Grid, SheetOrder } from '../lib/spriteSheet';
import type { SheetGuess } from '../lib/sheetGuess';
import { colors } from '../theme';
import { Button } from './Button';
import { MAX_TEXT_SCALE, Text } from './Text';

const MAX_CELLS_PER_SIDE = 20;
const PADDING = 16;

/** Parses a typed whole number, falling back when the field is empty or not a number. */
function parseCount(text: string, fallback: number, max: number): number {
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : fallback;
}

interface Props {
  /** The picked sprite sheet. The modal is shown while this is set. */
  uri: string | null;
  /**
   * Take just one card from the sheet (e.g. a card back): the player taps the cell they want, instead of
   * choosing how many cells to cut into cards.
   */
  pickOne?: boolean;
  /** The deck's card shape (width over height), which helps guess the sheet's grid. */
  cardRatio: number;
  /** Called with one image uri per card, in card order (just the one, when picking one). */
  onDone: (cards: string[]) => void;
  onCancel: () => void;
}

/** Slices one image laid out as a grid of cards into separate card images, or takes one card from it. */
export function SpriteSheetModal({ uri, pickOne = false, cardRatio, onDone, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [loaded, setLoaded] = useState<(LoadedImage & { source: string }) | null>(null);
  // Kept between imports, since sheets from the same game usually share a layout.
  const [rowsText, setRowsText] = useState('2');
  const [colsText, setColsText] = useState('2');
  const [countText, setCountText] = useState('');
  const [order, setOrder] = useState<SheetOrder>('rows');
  const [turn, setTurn] = useState<QuarterTurn>(0);
  const [progress, setProgress] = useState<number | null>(null);
  /** When picking one card: the cell chosen, as row and column. */
  const [chosen, setChosen] = useState({ r: 0, c: 0 });
  /** The grid worked out from the sheet itself (filled in for the player to check), and while it's being worked out. */
  const [guess, setGuess] = useState<(SheetGuess & { source: string }) | null>(null);
  const [guessing, setGuessing] = useState(false);
  /** Cards (by number) left out of the import: tapped, or dragged across, to leave out or put back. Per sheet. */
  const [skipped, setSkipped] = useState<{ source: string | null; cards: number[] }>({ source: null, cards: [] });
  /** A finger is choosing cards on the sheet (so the screen doesn't scroll under it). */
  const [painting, setPainting] = useState(false);

  const image = loaded && loaded.source === uri ? loaded : null;

  useEffect(() => {
    if (!uri) return;
    let canceled = false;
    loadUpright(uri)
      .then(async (img) => {
        if (canceled) return;
        setLoaded({ ...img, source: uri });
        // Then an educated guess at its grid, filled in as a start. If it can't be worked out, the numbers
        // stay as they were (sheets from one game usually share a layout).
        setGuessing(true);
        try {
          const found = guessSheet(await smallPixels(img.uri, img.width), cardRatio);
          if (canceled) return;
          setRowsText(String(found.rows));
          setColsText(String(found.columns));
          if (pickOne) {
            // Choosing a card back: if the sheet has one in its last cell, that's the one.
            if (found.backInLastCell) setChosen({ r: found.rows - 1, c: found.columns - 1 });
          } else {
            setCountText(found.count < found.rows * found.columns ? String(found.count) : '');
          }
          setGuess({ ...found, source: uri });
        } catch {
          // Not worth bothering the player about: they set the grid by hand, as before.
        } finally {
          if (!canceled) setGuessing(false);
        }
      })
      .catch((e) => !canceled && Alert.alert('Could not open image', String(e)));
    return () => {
      canceled = true;
    };
  }, [uri, cardRatio, pickOne]);

  const rows = parseCount(rowsText, 1, MAX_CELLS_PER_SIDE);
  const columns = parseCount(colsText, 1, MAX_CELLS_PER_SIDE);
  const cells = rows * columns;
  // More cards than the grid has cells (it was made smaller): as many as it can hold. Set during render, React's
  // way for state that follows other state.
  if (countText && parseInt(countText, 10) > cells) setCountText(String(cells));
  const grid: Grid = pickOne
    ? { rows, columns, count: cells, order: 'rows' }
    : { rows, columns, count: parseCount(countText, cells, cells), order };
  const left = new Set(skipped.source === uri ? skipped.cards.filter((n) => n < grid.count) : []);
  const taking = grid.count - left.size;
  /** Leaves cards out of the import, or puts them back. */
  const mark = (cards: number[], out: boolean) =>
    setSkipped((was) => {
      const now = new Set(was.source === uri ? was.cards : []);
      for (const n of cards) {
        if (out) now.add(n);
        else now.delete(n);
      }
      return { source: uri, cards: [...now] };
    });
  // A finger on the sheet: a tap leaves a card out (or puts it back), and dragging on does the same to every
  // card it passes over. What it needs that changes from render to render; its handlers are made once.
  const [paint] = useState(() => {
    const box = {
      at: (_x: number, _y: number): number | null => null,
      isLeft: (_n: number) => false,
      mark: (_cards: number[], _out: boolean) => {},
      setPainting: (_on: boolean) => {},
      start: { x: 0, y: 0 },
      out: false,
      last: null as number | null,
    };
    const touch = (x: number, y: number) => {
      const n = box.at(x, y);
      if (n === null || n === box.last) return;
      box.last = n;
      box.mark([n], box.out);
      haptics.tick();
    };
    return {
      set: (next: Partial<typeof box>) => Object.assign(box, next),
      responder: PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          const n = box.at(x, y);
          Object.assign(box, { start: { x, y }, last: null, out: n === null ? true : !box.isLeft(n) });
          box.setPainting(true);
          touch(x, y);
        },
        onPanResponderMove: (_, g) => touch(box.start.x + g.dx, box.start.y + g.dy),
        onPanResponderRelease: () => box.setPainting(false),
        onPanResponderTerminate: () => box.setPainting(false),
      }),
    };
  });
  // The chosen cell, kept inside the grid if it shrinks.
  const pick = { r: Math.min(chosen.r, rows - 1), c: Math.min(chosen.c, columns - 1) };

  // What was found in the sheet, while the grid is still as guessed (once the player changes it, it's theirs).
  const shownGuess = guess && guess.source === uri && guess.rows === rows && guess.columns === columns ? guess : null;
  const guessNote = shownGuess
    ? (shownGuess.confidence === 'high'
        ? `Found ${columns} columns and ${rows} rows`
        : `Best guess: ${columns} columns and ${rows} rows. Check the lines sit between the cards, or slide the numbers to fix them`) +
      (shownGuess.backInLastCell
        ? pickOne
          ? '. The last cell looks like a card back, so it’s chosen.'
          : '. The last cell looks like a card back, so it’s left out.'
        : '.')
    : null;

  // Fit the preview inside the screen width and a bit under half its height.
  const box = { w: screenW - PADDING * 2, h: screenH * 0.42 };
  const fit = image ? Math.min(box.w / image.width, box.h / image.height) : 0;
  const preview = image ? { w: image.width * fit, h: image.height * fit } : null;
  paint.set({
    at: (x, y) => {
      if (!preview || x < 0 || y < 0 || x >= preview.w || y >= preview.h) return null;
      return cellNumber(Math.floor((y / preview.h) * rows), Math.floor((x / preview.w) * columns), grid);
    },
    isLeft: (n) => left.has(n),
    mark,
    setPainting,
  });
  const importCards = async () => {
    if (!image) return;
    const all = cellRects(image.width, image.height, grid);
    const rects = pickOne ? [all[pick.r * columns + pick.c]] : all.filter((_, n) => !left.has(n));
    const out: string[] = [];
    try {
      for (const [i, rect] of rects.entries()) {
        setProgress(i);
        out.push(await saveCrop(image.uri, rect, turn));
      }
      onDone(out);
    } catch (e) {
      Alert.alert('Could not cut out the cards', String(e));
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;

  return (
    <Modal visible={uri !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.screen} behavior="padding">
        <ScrollView
          scrollEnabled={!painting}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24, paddingHorizontal: PADDING, gap: 16 }}>
          <Text style={styles.title}>{pickOne ? 'Choose a card from the sheet' : 'Import sprite sheet'}</Text>
          {pickOne ? <Text style={styles.help}>Set the grid, then tap the card to use.</Text> : null}

          <View style={[styles.previewBox, { height: preview?.h ?? box.h }]}>
            {image && preview ? (
              <View style={{ width: preview.w, height: preview.h }}>
                <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill} />
                {Array.from({ length: rows }, (_, r) =>
                  Array.from({ length: columns }, (_, c) => {
                    const n = cellNumber(r, c, grid);
                    const box = {
                      left: (c * preview.w) / columns,
                      top: (r * preview.h) / rows,
                      width: preview.w / columns,
                      height: preview.h / rows,
                    };
                    if (pickOne) {
                      // Picking one: every cell can be tapped; the chosen one is outlined, the rest dimmed.
                      const on = pick.r === r && pick.c === c;
                      return (
                        <Pressable
                          key={`${r}-${c}`}
                          onPress={() => setChosen({ r, c })}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`Row ${r + 1}, column ${c + 1}`}
                          style={[styles.cell, box, on ? styles.chosenCell : styles.otherCell]}
                        />
                      );
                    }
                    const out = n !== null && left.has(n);
                    return (
                      <View key={`${r}-${c}`} style={[styles.cell, box, n === null && styles.unusedCell, out && styles.otherCell]}>
                        {n !== null ? <Text style={[styles.cellNumber, out && styles.cellNumberOut]}>{n + 1}</Text> : null}
                      </View>
                    );
                  }),
                )}
                {/* Choosing which cards to take: tap one, or drag across several, to leave them out or put them back. */}
                {pickOne ? null : (
                  <View
                    {...paint.responder.panHandlers}
                    style={StyleSheet.absoluteFill}
                    accessible
                    accessibilityLabel={`${taking} of ${grid.count} cards chosen`}
                    accessibilityHint="Tap or drag across cards to leave them out or put them back."
                  />
                )}
              </View>
            ) : (
              <ActivityIndicator color={colors.accent} size="large" />
            )}
          </View>

          {guessing ? (
            <View style={styles.guessRow}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.help}>Finding the grid…</Text>
            </View>
          ) : guessNote ? (
            <Text style={styles.guessNote}>{guessNote}</Text>
          ) : null}

          <View style={styles.fields}>
            <NumberField label="Rows" value={rowsText} onChange={setRowsText} max={MAX_CELLS_PER_SIDE} fallback={rows} />
            <NumberField label="Columns" value={colsText} onChange={setColsText} max={MAX_CELLS_PER_SIDE} fallback={columns} />
            {pickOne ? null : (
              <NumberField
                label="Cards"
                value={countText}
                onChange={setCountText}
                placeholder={String(cells)}
                max={cells}
                fallback={cells}
              />
            )}
          </View>
          {pickOne ? null : (
            <View style={styles.chooseRow}>
              <Text style={[styles.help, { flex: 1, marginTop: 0 }]}>Tap or drag across cards to leave them out.</Text>
              <Button
                label={left.size ? 'Select All' : 'Deselect All'}
                onPress={() => {
                  mark(Array.from({ length: grid.count }, (_, n) => n), !left.size);
                  haptics.tick();
                }}
              />
            </View>
          )}
          {pickOne ? null : (
            <>
              <Text style={styles.help}>
                Cards counts the cells that have artwork, starting from cell 1. Leave it empty to use every cell.
              </Text>
              <Segment
                label="Order"
                value={order}
                onChange={setOrder}
                options={[
                  ['rows', 'Across rows'],
                  ['columns', 'Down columns'],
                ]}
              />
            </>
          )}

          <Segment
            label="Rotate cards"
            value={turn}
            onChange={setTurn}
            options={[
              [0, 'None'],
              [-90, '⟲ Left'],
              [90, 'Right ⟳'],
            ]}
          />
          <Text style={styles.help}>For art drawn sideways, such as cards played horizontally.</Text>
        </ScrollView>

        <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
          <Button label="Cancel" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
          <Button
            label={
              pickOne
                ? busy
                  ? 'Cutting…'
                  : 'Use this card'
                : busy
                  ? `Cutting ${progress + 1} of ${taking}…`
                  : `Add ${taking} ${taking === 1 ? 'card' : 'cards'}`
            }
            variant="primary"
            onPress={importCards}
            disabled={busy || !image || (!pickOne && taking === 0)}
            style={{ flex: 2 }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Segment<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segment}>
        {options.map(([v, text]) => (
          <Pressable
            key={String(v)}
            onPress={() => onChange(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === v }}
            style={[styles.segmentItem, value === v && styles.segmentSelected]}>
            <Text style={[styles.segmentText, value === v && { color: colors.accentText }]}>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** How far a finger slides across a number field to change it by one. */
const SCRUB_STEP_PX = 18;

/**
 * A whole number that changes as a finger slides left and right across it (one step per short slide, with a
 * tick for each), so whatever it controls updates live. A tap without sliding opens it for typing instead.
 */
function NumberField({
  label,
  value,
  onChange,
  placeholder,
  max,
  fallback,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  /** The most it can be slid up to. */
  max: number;
  /** What an empty field counts as when sliding starts (e.g. every cell, for a blank card count). */
  fallback: number;
}) {
  const [sliding, setSliding] = useState(false);
  const [typing, setTyping] = useState(false);
  // What the slide needs that changes from render to render; the slide's own handlers are made once.
  const [latest] = useState(() => {
    const box = { value: 1, max, onChange, typing: false, start: 1, shown: 1, moved: false };
    return { set: (next: Partial<typeof box>) => Object.assign(box, next), get: () => box };
  });
  const current = parseCount(value, fallback, max);
  latest.set({ value: current, max, onChange, typing });
  /** Steps the number by `by`, within 1 and `max`. */
  const step = (by: number) => {
    const next = Math.min(max, Math.max(1, current + by));
    if (next === current) return;
    onChange(String(next));
    haptics.tick();
  };
  const [responder] = useState(() =>
    PanResponder.create({
      // The number itself takes the touch (not a text field, which would keep it for typing).
      onStartShouldSetPanResponder: () => !latest.get().typing,
      onMoveShouldSetPanResponder: () => !latest.get().typing,
      // Until it's slid sideways, an up-and-down drag can still scroll the screen instead.
      onPanResponderTerminationRequest: () => !latest.get().moved,
      onPanResponderGrant: () => {
        Keyboard.dismiss();
        const { value: now } = latest.get();
        latest.set({ start: now, shown: now, moved: false });
      },
      onPanResponderMove: (_, g) => {
        const { start, shown, moved, max: most, onChange: change } = latest.get();
        if (!moved) {
          if (Math.abs(g.dx) < 6) return;
          latest.set({ moved: true });
          setSliding(true);
        }
        const next = Math.min(most, Math.max(1, start + Math.round(g.dx / SCRUB_STEP_PX)));
        if (next === shown) return;
        latest.set({ shown: next });
        change(String(next));
        haptics.tick();
      },
      onPanResponderRelease: () => {
        setSliding(false);
        // A tap, not a slide: type a number instead.
        if (!latest.get().moved) setTyping(true);
      },
      onPanResponderTerminate: () => setSliding(false),
    }),
  );
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {typing ? (
        <View style={[styles.scrub, styles.scrubbing]}>
          <TextInput
            autoFocus
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            value={value}
            onChangeText={(t) => onChange(t.replace(/\D/g, ''))}
            onBlur={() => setTyping(false)}
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={3}
            selectTextOnFocus
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            accessibilityLabel={label}
          />
        </View>
      ) : (
        <View
          {...responder.panHandlers}
          style={[styles.scrub, sliding && styles.scrubbing]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: value || placeholder || String(current) }}
          accessibilityHint="Swipe up or down to change it, or double-tap to type a number."
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'increment') step(1);
            else if (e.nativeEvent.actionName === 'decrement') step(-1);
            else setTyping(true);
          }}>
          <Text style={[styles.input, !value && { color: colors.textMuted }]}>{value || placeholder}</Text>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  previewBox: { alignItems: 'center', justifyContent: 'center' },
  cell: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.accent,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  unusedCell: { backgroundColor: 'rgba(0,0,0,0.65)', borderColor: 'rgba(255,255,255,0.25)' },
  chosenCell: { borderWidth: 3, borderColor: colors.accent },
  otherCell: { backgroundColor: 'rgba(0,0,0,0.45)', borderColor: 'rgba(255,255,255,0.25)' },
  cellNumber: {
    color: colors.accentText,
    backgroundColor: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 4,
    borderBottomRightRadius: 4,
    overflow: 'hidden',
  },
  cellNumberOut: { backgroundColor: 'rgba(255,255,255,0.35)', color: colors.bg },
  chooseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -6 },
  fields: { flexDirection: 'row', gap: 12 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  // A number field: slid across to change it, or tapped to type.
  scrub: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: 6,
  },
  scrubbing: { borderColor: colors.accent },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
  },
  help: { color: colors.textMuted, fontSize: 13, marginTop: -6 },
  guessRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4 },
  guessNote: { color: colors.accent, fontSize: 14, fontWeight: '500', marginTop: -6 },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 10, padding: 3, marginTop: 6 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  segmentSelected: { backgroundColor: colors.accent },
  segmentText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: PADDING,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
