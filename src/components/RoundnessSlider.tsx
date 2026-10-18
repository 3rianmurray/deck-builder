import { useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import * as haptics from '../lib/haptics';
import { DEFAULT_ROUNDNESS, MAX_ROUNDNESS } from '../lib/types';
import type { Deck } from '../lib/types';
import { colors } from '../theme';
import { CardView } from './CardView';
import { Text } from './Text';

const THUMB = 26;
/** The card beside it (given a deck), big enough to see its corners. */
const PREVIEW_W = 44;

/**
 * How round a deck's card corners are: a slider from square to very round, with one of its cards beside it
 * (given the deck) showing the corners as they'll be while the finger moves. Saved when the finger lifts.
 */
export function RoundnessSlider({
  deck,
  value: given,
  onChange,
  onSliding,
  onDraft,
}: {
  /** The deck: its roundness, and one of its cards to show it on. */
  deck?: Deck;
  /** The roundness, without a deck. */
  value?: number;
  onChange: (roundness: number) => void;
  /** Told when a finger starts and stops moving it (e.g. to keep the screen from scrolling meanwhile). */
  onSliding?: (sliding: boolean) => void;
  /** Told the roundness under the finger as it moves (null once it lifts), to show it elsewhere as it changes. */
  onDraft?: (roundness: number | null) => void;
}) {
  const saved = given ?? deck?.roundness ?? DEFAULT_ROUNDNESS;
  /** The roundness under the finger, while it's on the slider. */
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? saved;
  const [width, setWidth] = useState(1);
  const [track] = useState(() => {
    const box = { w: 1, x: 0, value: saved, onChange, onSliding, onDraft };
    return { set: (next: Partial<typeof box>) => Object.assign(box, next), get: () => box };
  });
  track.set({ onChange, onSliding, onDraft });
  const at = (x: number) => {
    const { w } = track.get();
    const r = Math.min(1, Math.max(0, (x - THUMB / 2) / Math.max(1, w - THUMB))) * MAX_ROUNDNESS;
    // Snaps to square, and to the usual roundness, when it comes near.
    if (r < 0.006) return 0;
    if (Math.abs(r - DEFAULT_ROUNDNESS) < 0.006) return DEFAULT_ROUNDNESS;
    return Math.round(r * 1000) / 1000;
  };
  const move = (x: number) => {
    const next = at(x);
    if (next !== track.get().value && (next === 0 || next === DEFAULT_ROUNDNESS)) haptics.tick();
    track.set({ value: next });
    setDraft(next);
    track.get().onDraft?.(next);
  };
  const [touches] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        track.get().onSliding?.(true);
        move(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e, g) => move(track.get().x + g.dx),
      onPanResponderRelease: () => {
        track.get().onChange(track.get().value);
        track.get().onSliding?.(false);
        track.get().onDraft?.(null);
        setDraft(null);
      },
      onPanResponderTerminate: () => {
        track.get().onSliding?.(false);
        track.get().onDraft?.(null);
        setDraft(null);
      },
    }),
  );
  const left = (value / MAX_ROUNDNESS) * Math.max(0, width - THUMB);
  const card = deck?.cards[0];

  return (
    <View style={styles.row}>
      {deck ? <CardView deck={{ ...deck, roundness: value }} card={card} faceUp={!!card} width={PREVIEW_W} /> : null}
      <View style={{ flex: 1, gap: 4 }}>
        <View
          {...touches.panHandlers}
          onLayout={(e) => {
            track.set({ w: e.nativeEvent.layout.width });
            setWidth(e.nativeEvent.layout.width);
          }}
          onTouchStart={(e) => track.set({ x: e.nativeEvent.locationX })}
          style={styles.area}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Corner roundness"
          accessibilityValue={{ min: 0, max: 100, now: Math.round((value / MAX_ROUNDNESS) * 100) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) =>
            onChange(Math.min(MAX_ROUNDNESS, Math.max(0, saved + (e.nativeEvent.actionName === 'increment' ? 0.02 : -0.02))))
          }>
          {/* None of these take touches, so a touch's place is always measured along the whole track (on the thumb,
              it would be measured from the thumb, and jump to the start). */}
          <View style={[styles.track, styles.noTouch]} />
          <View style={[styles.fill, styles.noTouch, { width: left + THUMB / 2 }]} />
          <View style={[styles.thumb, styles.noTouch, { left }]} />
        </View>
        <View style={styles.ends}>
          <Text style={styles.end}>Square</Text>
          <Text style={styles.end}>Round</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  area: { height: 36, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceRaised, marginHorizontal: THUMB / 2 },
  fill: { position: 'absolute', left: THUMB / 2, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.text,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  noTouch: { pointerEvents: 'none' },
  end: { color: colors.textMuted, fontSize: 12 },
});
