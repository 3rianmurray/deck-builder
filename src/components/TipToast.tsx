import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dismissTip, TIPS, useTip } from '../lib/tips';
import type { TipId } from '../lib/tips';
import { colors } from '../theme';
import { Text } from './Text';

/** How long a tip stays before it goes by itself. */
const SHOW_MS = 9000;
const IN_MS = 260;
const OUT_MS = 200;

/**
 * A tip (see lib/tips), over every screen: a small card sliding down from the top, out of the way, nothing dimmed or
 * blocked. Tapping it (or Got it) puts it away; otherwise it goes by itself after a while.
 */
export function TipToast() {
  const tip = useTip();
  const insets = useSafeAreaInsets();
  // The tip last shown, kept while it slides away.
  const [shown, setShown] = useState<TipId | null>(tip);
  if (tip && tip !== shown) setShown(tip);
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!tip) {
      Animated.timing(slide, { toValue: 0, duration: OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
      return;
    }
    Animated.timing(slide, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const timer = setTimeout(dismissTip, SHOW_MS);
    return () => clearTimeout(timer);
  }, [tip, slide]);

  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents={tip ? 'box-none' : 'none'}
      style={[
        styles.wrap,
        { top: insets.top + 8 },
        { opacity: slide, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] },
      ]}>
      <Pressable onPress={dismissTip} accessibilityRole="button" accessibilityHint="Puts the tip away." style={styles.card}>
        <SymbolView name={{ ios: 'lightbulb', android: 'lightbulb', web: 'lightbulb' }} size={18} tintColor={colors.accent} />
        <Text style={styles.text}>{TIPS[shown]}</Text>
        <View style={styles.ok}>
          <Text style={styles.okText}>Got it</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 440,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(16,22,30,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(224,179,84,0.45)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  text: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 19 },
  ok: { paddingHorizontal: 4 },
  okText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
});
