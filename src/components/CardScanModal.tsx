import { Canvas, Circle, Group, Image as SkiaImage, Line, Path, Skia, useImage, vec } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, PanResponder, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { homography, turnCorners, uprightCorners } from '../lib/cardScan';
import type { Point, Quad } from '../lib/cardScan';
import { startScan, straighten } from '../lib/cardWarp';
import type { ScanStart } from '../lib/cardWarp';
import * as haptics from '../lib/haptics';
import { colors } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

/** How near a finger must land to a corner to pick it up. */
const GRAB_RADIUS = 48;
/** The handles' size, the magnifier's, and how much it magnifies. */
const HANDLE = 26;
const LOUPE = 120;
const LOUPE_ZOOM = 2.5;
/** The live preview of the straightened card: its height. */
const PREVIEW_H = 96;

interface Props {
  /** The photo to find a card in. The screen shows while this is set. */
  uri: string | null;
  /** The deck's card shape (width over height): the card comes out exactly this shape. */
  cardRatio: number;
  /** The straightened card, card shaped. */
  onDone: (card: string) => void;
  /** Crop it the usual way instead (from the photo as taken). */
  onCropByHand: (uri: string) => void;
  onCancel: () => void;
  /** Once it has slid away (iOS can only show another full-screen view, like the cropper, after that). */
  onClosed?: () => void;
}

/**
 * Finds the card in a photo and straightens it: the card's corners are found (an educated guess, shown as four
 * handles to drag into place if they're off), and the photo is stretched so they become the corners of a flat
 * card of the deck's shape, taking out any tilt or perspective.
 */
export function CardScanModal({ uri, cardRatio, onDone, onCropByHand, onCancel, onClosed }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [scan, setScan] = useState<(ScanStart & { source: string }) | null>(null);
  /** The corners as placed (the photo's pixels), and how many quarter turns the card is given. */
  const [corners, setCorners] = useState<Quad | null>(null);
  const [turns, setTurns] = useState(0);
  /** The corner being dragged, if any. */
  const [dragging, setDragging] = useState<number | null>(null);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const shown = scan && scan.source === uri ? scan : null;
  const image = useImage(shown?.uri ?? null);

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    startScan(uri)
      .then((s) => {
        if (cancelled) return;
        setScan({ ...s, source: uri });
        setCorners(s.corners);
        // A card photographed sideways is turned to stand the deck's way.
        setTurns(uprightCorners(s.corners, cardRatio) === s.corners ? 0 : 1);
      })
      .catch((e) => !cancelled && Alert.alert('Could not open the photo', String(e)));
    return () => {
      cancelled = true;
    };
  }, [uri, cardRatio]);

  // The photo fitted into the space it has; `fit` takes its pixels to the screen's.
  const fit = shown && area ? Math.min(area.w / shown.width, area.h / shown.height) : 0;
  const box = shown ? { w: shown.width * fit, h: shown.height * fit } : null;
  const onScreen = (p: Point) => ({ x: p.x * fit, y: p.y * fit });

  // Dragging a corner: the nearest one to where the finger lands, moved with it (kept on the photo). The
  // handlers are made once, reading the latest of what they need.
  const [latest] = useState(() => {
    const live = { corners: null as Quad | null, fit: 0, box: null as { w: number; h: number } | null, index: -1, from: { x: 0, y: 0 } };
    return { set: (next: Partial<typeof live>) => Object.assign(live, next), get: () => live };
  });
  latest.set({ corners, fit, box });
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        const { corners: q, fit: k } = latest.get();
        if (!q || !k) return false;
        const { locationX: x, locationY: y } = e.nativeEvent;
        const dist = q.map((p) => Math.hypot(p.x * k - x, p.y * k - y));
        const index = dist.indexOf(Math.min(...dist));
        if (dist[index] > GRAB_RADIUS) return false;
        latest.set({ index, from: { ...q[index] } });
        return true;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        setDragging(latest.get().index);
        haptics.lift();
      },
      onPanResponderMove: (_, g) => {
        const { corners: q, fit: k, box: b, index, from } = latest.get();
        if (!q || !k || !b || index < 0) return;
        const x = Math.min(b.w / k, Math.max(0, from.x + g.dx / k));
        const y = Math.min(b.h / k, Math.max(0, from.y + g.dy / k));
        setCorners(q.map((p, i) => (i === index ? { x, y } : p)) as Quad);
      },
      onPanResponderRelease: () => {
        setDragging(null);
        haptics.drop();
      },
      onPanResponderTerminate: () => setDragging(null),
    }),
  );

  // The corners as they become the card's: turned as asked (so the right side ends up on top).
  let card = corners;
  for (let i = 0; card && i < turns % 4; i++) card = turnCorners(card);
  // The live preview: the deck's shape (sideways turns don't change that), the straightened photo in it.
  const preview = { w: PREVIEW_H * cardRatio, h: PREVIEW_H };
  const previewMatrix = card
    ? Skia.Matrix(
        homography(card, [
          { x: 0, y: 0 },
          { x: preview.w, y: 0 },
          { x: preview.w, y: preview.h },
          { x: 0, y: preview.h },
        ]),
      )
    : null;

  // The outline, and everything outside it shaded.
  const outlineBuilder = Skia.PathBuilder.Make();
  const shadeBuilder = Skia.PathBuilder.Make();
  if (corners && box) {
    const pts = corners.map(onScreen);
    outlineBuilder.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach((p) => outlineBuilder.lineTo(p.x, p.y));
    outlineBuilder.close();
  }
  const outline = outlineBuilder.build();
  if (corners && box) {
    shadeBuilder.addRect(Skia.XYWHRect(0, 0, box.w, box.h)).addPath(outline);
    shadeBuilder.setFillType(1); // even-odd: the card's outline is a hole in the shading
  }
  const shade = shadeBuilder.build();
  const held = dragging !== null && corners ? corners[dragging] : null;
  // The magnifier: over the side of the photo away from the corner being dragged, so the finger isn't over it.
  const loupeAt = held && box ? { x: onScreen(held).x < box.w / 2 ? box.w - LOUPE - 8 : 8, y: 8 } : null;

  const use = async () => {
    if (!shown || !card) return;
    setSaving(true);
    try {
      onDone(await straighten(shown.uri, card, cardRatio));
    } catch (e) {
      Alert.alert('Could not straighten the card', String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={uri !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
      onDismiss={onClosed}>
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Fit the card</Text>
        <Text style={styles.help}>
          {shown && !shown.found
            ? 'Couldn’t spot the card. Drag the four corners onto its corners.'
            : 'Drag a corner if it isn’t on the card’s corner. The card is straightened to fit.'}
        </Text>

        <View style={styles.photoArea} onLayout={(e: LayoutChangeEvent) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {shown && box && image && corners ? (
            <View style={{ width: box.w, height: box.h }} {...responder.panHandlers}>
              <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
                <SkiaImage image={image} x={0} y={0} width={box.w} height={box.h} fit="fill" />
                <Path path={shade} color="rgba(0,0,0,0.45)" />
                <Path path={outline} color={colors.accent} style="stroke" strokeWidth={2} />
                {corners.map((p, i) => {
                  const s = onScreen(p);
                  return (
                    <Group key={i}>
                      <Circle cx={s.x} cy={s.y} r={HANDLE / 2} color={i === dragging ? colors.accent : 'rgba(224,179,84,0.35)'} />
                      <Circle cx={s.x} cy={s.y} r={HANDLE / 2} color={colors.accent} style="stroke" strokeWidth={2} />
                    </Group>
                  );
                })}
              </Canvas>
              {held && loupeAt ? (
                <View style={[styles.loupe, { left: loupeAt.x, top: loupeAt.y }]} pointerEvents="none">
                  <Canvas style={{ width: LOUPE, height: LOUPE }}>
                    <Group
                      transform={[
                        { translateX: LOUPE / 2 - held.x * fit * LOUPE_ZOOM },
                        { translateY: LOUPE / 2 - held.y * fit * LOUPE_ZOOM },
                        { scale: LOUPE_ZOOM },
                      ]}>
                      <SkiaImage image={image} x={0} y={0} width={box.w} height={box.h} fit="fill" />
                      <Path path={outline} color={colors.accent} style="stroke" strokeWidth={1.5 / LOUPE_ZOOM} />
                    </Group>
                    <Line p1={vec(LOUPE / 2 - 10, LOUPE / 2)} p2={vec(LOUPE / 2 + 10, LOUPE / 2)} color="#fff" strokeWidth={1} />
                    <Line p1={vec(LOUPE / 2, LOUPE / 2 - 10)} p2={vec(LOUPE / 2, LOUPE / 2 + 10)} color="#fff" strokeWidth={1} />
                  </Canvas>
                </View>
              ) : null}
            </View>
          ) : (
            <ActivityIndicator color={colors.accent} size="large" />
          )}
        </View>

        <View style={styles.previewRow}>
          <View style={[styles.preview, { width: preview.w, height: preview.h }]}>
            {image && previewMatrix && shown ? (
              <Canvas style={{ width: preview.w, height: preview.h }}>
                <Group matrix={previewMatrix}>
                  <SkiaImage image={image} x={0} y={0} width={shown.width} height={shown.height} fit="fill" />
                </Group>
              </Canvas>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              setTurns((t) => (t + 1) % 4);
              haptics.tick();
            }}
            disabled={!corners}
            accessibilityRole="button"
            accessibilityLabel="Turn the card a quarter turn"
            hitSlop={8}
            style={({ pressed }) => [styles.turn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.turnText}>⟳ Turn</Text>
          </Pressable>
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + 12, maxWidth: screenW }]}>
          <Button label="Cancel" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
          <Button label="Crop by hand" onPress={() => uri && onCropByHand(uri)} disabled={saving} style={{ flex: 1.3 }} />
          <Button label={saving ? 'Saving…' : 'Use card'} variant="primary" onPress={use} disabled={saving || !corners} style={{ flex: 1.2 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, gap: 10 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  help: { color: colors.textMuted, fontSize: 14 },
  photoArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loupe: {
    position: 'absolute',
    width: LOUPE,
    height: LOUPE,
    borderRadius: LOUPE / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  preview: { borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surface },
  turn: { backgroundColor: colors.surfaceRaised, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  turnText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 6 },
});
