import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { imageUri } from '../lib/storage';
import type { Card, Deck } from '../lib/types';
import { CARD_RATIO, colors } from '../theme';

interface Props {
  deck: Deck;
  card?: Card;
  faceUp?: boolean;
  width: number;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Renders a card face, or the deck's back when `faceUp` is false or there is no card. */
export function CardView({ deck, card, faceUp = true, width, onPress, onLongPress, selected, style }: Props) {
  const height = width / CARD_RATIO;
  const radius = Math.max(4, width * 0.06);
  const showFace = faceUp && card;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={showFace ? card.name : 'Face-down card'}
      style={({ pressed }) => [
        styles.card,
        { width, height, borderRadius: radius },
        selected && styles.selected,
        pressed && { opacity: 0.8 },
        style,
      ]}>
      {showFace ? (
        <Image source={{ uri: imageUri(card.image) }} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} contentFit="cover" />
      ) : deck.backImage ? (
        <Image source={{ uri: imageUri(deck.backImage) }} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} contentFit="cover" />
      ) : (
        <DefaultBack radius={radius} />
      )}
    </Pressable>
  );
}

function DefaultBack({ radius }: { radius: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.back, { borderRadius: radius }]}>
      <View style={[styles.backInner, { borderRadius: radius * 0.6 }]}>
        <Text style={styles.backMark}>✦</Text>
      </View>
    </View>
  );
}

export function EmptySlot({ width, label }: { width: number; label: string }) {
  return (
    <View style={[styles.empty, { width, height: width / CARD_RATIO, borderRadius: Math.max(4, width * 0.06) }]}>
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  selected: { borderWidth: 2, borderColor: colors.accent },
  back: { backgroundColor: '#5b2a3c', padding: '8%' },
  backInner: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backMark: { color: colors.accent, fontSize: 18 },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center' },
});
