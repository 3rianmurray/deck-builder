import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadUpright, saveCrop } from '../lib/images';
import type { LoadedImage, QuarterTurn } from '../lib/images';
import { cellNumber, cellRects } from '../lib/spriteSheet';
import type { Grid, SheetOrder } from '../lib/spriteSheet';
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
  /** Called with one image uri per card, in card order (just the one, when picking one). */
  onDone: (cards: string[]) => void;
  onCancel: () => void;
}

/** Slices one image laid out as a grid of cards into separate card images, or takes one card from it. */
export function SpriteSheetModal({ uri, pickOne = false, onDone, onCancel }: Props) {
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

  const image = loaded && loaded.source === uri ? loaded : null;

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    loadUpright(uri)
      .then((img) => !cancelled && setLoaded({ ...img, source: uri }))
      .catch((e) => !cancelled && Alert.alert('Could not open image', String(e)));
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const rows = parseCount(rowsText, 1, MAX_CELLS_PER_SIDE);
  const columns = parseCount(colsText, 1, MAX_CELLS_PER_SIDE);
  const cells = rows * columns;
  const grid: Grid = pickOne
    ? { rows, columns, count: cells, order: 'rows' }
    : { rows, columns, count: parseCount(countText, cells, cells), order };
  // The chosen cell, kept inside the grid if it shrinks.
  const pick = { r: Math.min(chosen.r, rows - 1), c: Math.min(chosen.c, columns - 1) };

  // Fit the preview inside the screen width and a bit under half its height.
  const box = { w: screenW - PADDING * 2, h: screenH * 0.42 };
  const fit = image ? Math.min(box.w / image.width, box.h / image.height) : 0;
  const preview = image ? { w: image.width * fit, h: image.height * fit } : null;

  const importCards = async () => {
    if (!image) return;
    const all = cellRects(image.width, image.height, grid);
    const rects = pickOne ? [all[pick.r * columns + pick.c]] : all;
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
                    return (
                      <View key={`${r}-${c}`} style={[styles.cell, box, n === null && styles.unusedCell]}>
                        {n !== null ? <Text style={styles.cellNumber}>{n + 1}</Text> : null}
                      </View>
                    );
                  }),
                )}
              </View>
            ) : (
              <ActivityIndicator color={colors.accent} size="large" />
            )}
          </View>

          <View style={styles.fields}>
            <NumberField label="Rows" value={rowsText} onChange={setRowsText} />
            <NumberField label="Columns" value={colsText} onChange={setColsText} />
            {pickOne ? null : (
              <NumberField label="Cards" value={countText} onChange={setCountText} placeholder={String(cells)} />
            )}
          </View>
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
                  ? `Cutting ${progress + 1} of ${grid.count}…`
                  : `Add ${grid.count} ${grid.count === 1 ? 'card' : 'cards'}`
            }
            variant="primary"
            onPress={importCards}
            disabled={busy || !image}
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

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, ''))}
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
  fields: { flexDirection: 'row', gap: 12 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    borderRadius: 10,
    paddingVertical: 10,
  },
  help: { color: colors.textMuted, fontSize: 13, marginTop: -6 },
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
