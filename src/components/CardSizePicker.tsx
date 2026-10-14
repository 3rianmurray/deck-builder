import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { cardRatio, isLandscape } from '../lib/types';
import type { CardShape } from '../lib/types';
import { colors } from '../theme';

const OPTIONS: { kind: CardShape['kind']; label: string; portrait: string; landscape: string }[] = [
  { kind: 'standard', label: 'Standard', portrait: 'Playing card · 2.5 × 3.5 in (5:7)', landscape: 'Playing card · 3.5 × 2.5 in (7:5)' },
  { kind: 'usMini', label: 'US Mini', portrait: '41 × 63 mm (about 1:1.54)', landscape: '63 × 41 mm (about 1.54:1)' },
  { kind: 'custom', label: 'Custom', portrait: '', landscape: '' },
];

/** Accepts "2.5" or "2,5"; returns null unless it's a positive number. */
function parseSize(text: string): number | null {
  const n = parseFloat(text.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Chooses the physical card size, which sets the shape of every card and of the crop frame. */
export function CardSizePicker({ shape, onChange }: { shape: CardShape; onChange: (shape: CardShape) => void }) {
  // Drafts let the user clear a field mid-edit without the deck jumping to a broken size.
  const [widthText, setWidthText] = useState(shape.kind === 'custom' ? String(shape.width) : '2.5');
  const [heightText, setHeightText] = useState(shape.kind === 'custom' ? String(shape.height) : '3.5');

  const commitCustom = (w: string, h: string) => {
    const width = parseSize(w);
    const height = parseSize(h);
    if (width && height) onChange({ kind: 'custom', width, height });
  };

  const landscape = isLandscape(shape);

  /** Commits typed custom sizes, swapped if needed so they match the chosen orientation. */
  const commitOriented = (wantLandscape: boolean) => {
    const w = parseSize(widthText);
    const h = parseSize(heightText);
    if (w && h && w > h !== wantLandscape && w !== h) {
      setWidthText(heightText);
      setHeightText(widthText);
      commitCustom(heightText, widthText);
    } else {
      commitCustom(widthText, heightText);
    }
  };

  // Changing size keeps the orientation, and vice versa.
  const choose = (kind: CardShape['kind']) => {
    if (kind === 'custom') commitOriented(landscape);
    else onChange({ kind, landscape });
  };

  const orient = (wantLandscape: boolean) => {
    if (shape.kind === 'custom') commitOriented(wantLandscape);
    else onChange({ kind: shape.kind, landscape: wantLandscape });
  };

  const ratio = cardRatio({ cardShape: shape });
  const selected = OPTIONS.find((o) => o.kind === shape.kind)!;

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.segment}>
        {OPTIONS.map((o) => (
          <Pressable
            key={o.kind}
            onPress={() => choose(o.kind)}
            accessibilityRole="button"
            accessibilityState={{ selected: shape.kind === o.kind }}
            style={[styles.segmentItem, shape.kind === o.kind && styles.segmentSelected]}>
            <Text style={[styles.segmentText, shape.kind === o.kind && { color: colors.accentText }]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.segment}>
        {(
          [
            [false, 'Portrait'],
            [true, 'Landscape'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={label}
            onPress={() => orient(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: landscape === value }}
            style={[styles.segmentItem, landscape === value && styles.segmentSelected]}>
            <Text style={[styles.segmentText, landscape === value && { color: colors.accentText }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.detailRow}>
        {/* A small outline of the chosen shape. */}
        <View style={[styles.shape, ratio <= 1 ? { height: 40, width: 40 * ratio } : { width: 40, height: 40 / ratio }]} />
        {shape.kind === 'custom' ? (
          <View style={styles.customRow}>
            <SizeField
              label="Width"
              value={widthText}
              onChange={(t) => {
                setWidthText(t);
                commitCustom(t, heightText);
              }}
            />
            <Text style={styles.times}>×</Text>
            <SizeField
              label="Height"
              value={heightText}
              onChange={(t) => {
                setHeightText(t);
                commitCustom(widthText, t);
              }}
            />
          </View>
        ) : (
          <Text style={styles.detail}>{landscape ? selected.landscape : selected.portrait}</Text>
        )}
      </View>
    </View>
  );
}

function SizeField({ label, value, onChange }: { label: string; value: string; onChange: (text: string) => void }) {
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^\d.,]/g, ''))}
      keyboardType="decimal-pad"
      returnKeyType="done"
      maxLength={6}
      selectTextOnFocus
      placeholder={label}
      placeholderTextColor={colors.textMuted}
      style={styles.input}
      accessibilityLabel={`Card ${label.toLowerCase()}`}
    />
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 10, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  segmentSelected: { backgroundColor: colors.accent },
  segmentText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  shape: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 3 },
  detail: { color: colors.textMuted, fontSize: 14, flex: 1 },
  customRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  times: { color: colors.textMuted, fontSize: 16 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    borderRadius: 10,
    paddingVertical: 10,
  },
});
