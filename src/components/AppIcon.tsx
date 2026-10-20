import { Image, StyleSheet, View } from 'react-native';

import { colors } from '../theme';

/**
 * The app's icon, as shown on the Pro and About screens: lifted off the dark background by a soft gold glow under
 * it and a faint light edge round it (the icon's own art is dark, and would otherwise sink into the screen).
 */
export function AppIcon({ size }: { size: number }) {
  const radius = size * 0.225;
  return (
    <View style={[styles.glow, { width: size, height: size, borderRadius: radius, shadowRadius: size * 0.2 }]}>
      <Image
        source={require('../../assets/about-icon.png')}
        style={{ width: size, height: size, borderRadius: radius }}
        accessibilityIgnoresInvertColors
      />
      {/* The edge, over the picture so it shows all the way round. */}
      <View style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: radius }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // A warm glow, mostly below (as if lit from above), that fades well before the text.
  glow: {
    backgroundColor: colors.bg,
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  edge: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(255,255,255,0.18)', pointerEvents: 'none' },
});
