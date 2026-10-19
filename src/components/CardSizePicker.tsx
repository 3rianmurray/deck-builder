import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import * as haptics from '../lib/haptics';
import { cardRatio, isLandscape, parseSizeWithUnit, settledShape, sideInRange } from '../lib/types';
import type { CardShape, FixedShape, SizeUnit } from '../lib/types';
import { colors } from '../theme';
import { MAX_TEXT_SCALE, Text } from './Text';

type Kind = CardShape['kind'];

const OPTIONS: { kind: Kind; label: string }[] = [
  { kind: 'auto', label: 'Auto' },
  { kind: 'standard', label: 'Standard' },
  { kind: 'usMini', label: 'US Mini' },
  { kind: 'custom', label: 'Custom' },
];

/** A settled size in words, e.g. "Standard · 2.5 × 3.5 in". */
function describe(shape: FixedShape): string {
  const l = isLandscape(shape);
  if (shape.kind === 'standard') return `Standard · ${l ? '3.5 × 2.5' : '2.5 × 3.5'} in`;
  if (shape.kind === 'usMini') return `US Mini · ${l ? '63 × 41' : '41 × 63'} mm`;
  return `${shape.width} × ${shape.height}${shape.unit ? ` ${shape.unit}` : ''}`;
}

/** A custom size's side as it's shown for editing, with its unit (sizes saved before units are guessed at). */
function sideText(n: number, shape: Extract<FixedShape, { kind: 'custom' }>): string {
  const unit = shape.unit ?? (shape.width <= 12 && shape.height <= 12 ? 'in' : 'mm');
  return `${n}${unit}`;
}

/** Two typed sides as a custom size: in one unit (millimeters, if they were typed in different ones). */
function customFrom(w: string, h: string): FixedShape | null {
  const a = parseSizeWithUnit(w);
  const b = parseSizeWithUnit(h);
  if (!a || !b || !sideInRange(a) || !sideInRange(b)) return null;
  if (a.unit === b.unit) return { kind: 'custom', width: a.value, height: b.value, unit: a.unit };
  const mm = (x: { value: number; unit: SizeUnit }) => Math.round((x.unit === 'in' ? x.value * 25.4 : x.value) * 10) / 10;
  return { kind: 'custom', width: mm(a), height: mm(b), unit: 'mm' };
}

/**
 * Chooses the physical card size, which sets the shape of every card and of the crop frame: Auto (worked out from
 * the deck's first art), Standard, US Mini or a custom size, typed with its unit.
 */
export function CardSizePicker({ shape, onChange }: { shape: CardShape; onChange: (shape: CardShape) => void }) {
  const settled = settledShape(shape);
  const custom = settled.kind === 'custom' ? settled : null;
  // Drafts let the player clear a field mid-edit without the deck jumping to a broken size.
  const [widthText, setWidthText] = useState(custom ? sideText(custom.width, custom) : '2.5in');
  const [heightText, setHeightText] = useState(custom ? sideText(custom.height, custom) : '3.5in');
  const [open, setOpen] = useState(false);

  const landscape = isLandscape(shape);

  /** Commits typed custom sizes; given an orientation, swapped if needed to match it. */
  const commitCustom = (w: string, h: string, wantLandscape?: boolean) => {
    const next = customFrom(w, h);
    if (!next || next.kind !== 'custom') return;
    if (wantLandscape !== undefined && next.width > next.height !== wantLandscape && next.width !== next.height) {
      setWidthText(h);
      setHeightText(w);
      onChange({ ...next, width: next.height, height: next.width });
    } else {
      onChange(next);
    }
  };

  // Changing size keeps the orientation, and vice versa.
  const choose = (kind: Kind) => {
    setOpen(false);
    haptics.tick();
    if (kind === shape.kind) return;
    if (kind === 'auto') onChange({ kind: 'auto' });
    else if (kind === 'custom') commitCustom(widthText, heightText, landscape);
    else onChange({ kind, landscape });
  };

  const orient = (wantLandscape: boolean) => {
    if (settled.kind === 'custom') commitCustom(widthText, heightText, wantLandscape);
    else onChange({ kind: settled.kind, landscape: wantLandscape });
  };

  const ratio = cardRatio({ cardShape: shape });
  const current = OPTIONS.find((o) => o.kind === shape.kind)!;
  const widthSide = parseSizeWithUnit(widthText);
  const heightSide = parseSizeWithUnit(heightText);
  const widthOk = !!widthSide && sideInRange(widthSide);
  const heightOk = !!heightSide && sideInRange(heightSide);
  // Typed with units, but too small or too big.
  const outOfRange = !!widthSide && !!heightSide && !(widthOk && heightOk);

  return (
    <View style={{ gap: 8 }}>
      {/* A drop-down: the chosen size, opening to the others. */}
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`Card size: ${current.label}`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.dropdown, pressed && { opacity: 0.75 }]}>
        <Text style={styles.dropdownText}>{current.label}</Text>
        <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.menu}>
          {OPTIONS.map((o) => (
            <Pressable
              key={o.kind}
              onPress={() => choose(o.kind)}
              accessibilityRole="button"
              accessibilityState={{ selected: shape.kind === o.kind }}
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.menuText, shape.kind === o.kind && { color: colors.accent }]}>{o.label}</Text>
              {shape.kind === o.kind ? <Text style={[styles.menuText, { color: colors.accent }]}>✓</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Auto works out which way up the cards are, too. */}
      {shape.kind === 'auto' ? null : (
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
      )}

      <View style={styles.detailRow}>
        {/* A small outline of the chosen shape. */}
        <View style={[styles.shape, ratio <= 1 ? { height: 40, width: 40 * ratio } : { width: 40, height: 40 / ratio }]} />
        {shape.kind === 'custom' ? (
          <View style={{ flex: 1, gap: 6 }}>
            <View style={styles.customRow}>
              <SizeField
                label="Width"
                value={widthText}
                ok={widthOk}
                onChange={(t) => {
                  setWidthText(t);
                  commitCustom(t, heightText);
                }}
              />
              <Text style={styles.times}>×</Text>
              <SizeField
                label="Height"
                value={heightText}
                ok={heightOk}
                onChange={(t) => {
                  setHeightText(t);
                  commitCustom(widthText, t);
                }}
              />
            </View>
            <Text style={[styles.detail, !(widthOk && heightOk) && { color: colors.danger }]}>
              {widthOk && heightOk
                ? 'Each with in or mm, e.g. 2.5in × 3.5in'
                : outOfRange
                  ? 'Each side from 15mm to 300mm (0.6in to 11.8in)'
                  : 'Add in or mm to each, e.g. 2.5in or 63mm'}
            </Text>
          </View>
        ) : (
          <Text style={styles.detail}>
            {shape.kind === 'auto'
              ? shape.detected
                ? `Looks like ${describe(shape.detected)}`
                : 'Worked out from the first art you add'
              : describe(settled)}
          </Text>
        )}
      </View>
    </View>
  );
}

function SizeField({ label, value, ok, onChange }: { label: string; value: string; ok: boolean; onChange: (text: string) => void }) {
  return (
    <TextInput
      maxFontSizeMultiplier={MAX_TEXT_SCALE}
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^\d.,a-zA-Z" ]/g, ''))}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="done"
      maxLength={10}
      selectTextOnFocus
      placeholder={label === 'Width' ? '2.5in' : '3.5in'}
      placeholderTextColor={colors.textMuted}
      style={[styles.input, !ok && styles.inputBad]}
      accessibilityLabel={`Card ${label.toLowerCase()}, with in or mm`}
    />
  );
}

const styles = StyleSheet.create({
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  chevron: { color: colors.textMuted, fontSize: 16 },
  menu: { backgroundColor: colors.surface, borderRadius: 10, overflow: 'hidden', marginTop: -4 },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  menuText: { color: colors.text, fontSize: 16 },
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
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputBad: { borderColor: colors.danger },
});
