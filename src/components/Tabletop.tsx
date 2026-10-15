import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { colors } from '../theme';

const FELT_TEXTURE = require('../../assets/textures/felt.png');

/** Whether a card is on the play screen's table, where it casts a shadow on the cloth (not, say, in the deck editor). */
export const OnTabletopContext = createContext(false);
export const useOnTabletop = () => useContext(OnTabletopContext);

/** Shadows for cards on the tabletop, as if lit from above and slightly behind the player. */
export const tabletopShadow = {
  resting: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 5, shadowOffset: { width: 1, height: 4 }, elevation: 6 },
  lifted: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 6, height: 22 }, elevation: 16 },
} satisfies Record<string, ViewStyle>;

/**
 * The cloth the game is played on: a felt texture on a plane tilted away from the viewer (so the weave
 * shrinks into the distance, as if seen from a seat at the table), lit from above with darker edges.
 * Purely decorative: it sits behind the play area and never takes touches.
 */
export function TabletopSurface() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.surface]}>
      {/* Base cloth colour, lighter where the lamp is (top centre), darker nearer the player. */}
      <LinearGradient colors={[colors.feltLight, colors.felt, colors.feltDeep]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      {/*
        The weave, on a plane tilted back. It's oversized so the tilt never shows its edges. The clipping
        wrapper flattens it before it meets the layers around it; without it, iOS sorts the tilted plane by
        depth and hides the half leaning away behind the flat gradient underneath.
      */}
      <View style={[StyleSheet.absoluteFill, styles.flatten]}>
        <View style={styles.tiltedPlane}>
          <Image source={FELT_TEXTURE} resizeMode="repeat" style={styles.texture} />
        </View>
      </View>
      {/* Vignette: the cloth darkens towards every edge. */}
      <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent']} style={[styles.edge, { top: 0, height: '22%' }]} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)']} style={[styles.edge, { bottom: 0, height: '25%' }]} />
      <LinearGradient
        colors={['rgba(0,0,0,0.4)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.side, { left: 0 }]}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.4)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.side, { right: 0 }]}
      />
    </View>
  );
}

/**
 * The wooden rail along the bottom of the table, where the hand rests. A background layer: put it first
 * inside the hand's own view, so the hand keeps its layout.
 */
export function WoodRail() {
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <LinearGradient colors={['#6b4528', '#4a2d18', '#2e1b0e']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
      {/* A highlight along the rail's top edge, where the light catches it. */}
      <View style={styles.railHighlight} />
    </View>
  );
}

/** A faint printed outline marking where a pile goes, like on a playmat. */
export const matSpot: ViewStyle = {
  borderColor: 'rgba(255,255,255,0.16)',
  backgroundColor: 'rgba(0,0,0,0.12)',
};

const styles = StyleSheet.create({
  surface: { overflow: 'hidden', pointerEvents: 'none' },
  flatten: { overflow: 'hidden' },
  tiltedPlane: {
    position: 'absolute',
    left: '-60%',
    right: '-60%',
    top: '-40%',
    bottom: '-15%',
    transform: [{ perspective: 700 }, { rotateX: '38deg' }],
    // Just a hint of weave: enough to read as cloth, not enough to look noisy.
    opacity: 0.3,
  },
  texture: { width: '100%', height: '100%' },
  edge: { position: 'absolute', left: 0, right: 0 },
  side: { position: 'absolute', top: 0, bottom: 0, width: '12%' },
  railHighlight: { height: 1.5, backgroundColor: 'rgba(255,220,180,0.35)' },
});
