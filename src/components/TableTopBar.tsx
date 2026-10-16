import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme';
import { Text } from './Text';
import { TourSpot } from './TourSpot';

/** What the table on screen offers its top bar: its name, its menu, and undo. */
export interface TableControls {
  title: string;
  canUndo: boolean;
  /** Cards are being dragged: then nothing in the bar does anything. */
  busy: boolean;
  undo: () => void;
  openMenu: () => void;
}

/** Back to the screen before, or home if there isn't one (e.g. the app was reloaded straight onto the table). */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * The play screen's top bar, floating over the felt: a round back button, the deck's name as a pill that
 * opens the table's menu, and a round undo button. Until the table has reported in, just the back button.
 */
export function TableTopBar({ controls }: { controls: TableControls | null }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <RoundButton
        icon={{ ios: 'chevron.backward', android: 'arrow_back', web: 'arrow_back' }}
        label="Back"
        onPress={goBack}
        disabled={!!controls?.busy}
      />
      {controls ? (
        <Pressable
          onPress={controls.openMenu}
          disabled={controls.busy}
          accessibilityRole="button"
          accessibilityLabel={`${controls.title}, table options`}
          hitSlop={6}
          style={({ pressed }) => [styles.glass, styles.title, pressed && styles.pressed, controls.busy && styles.disabled]}>
          <Text style={styles.titleText} numberOfLines={1}>
            {controls.title}
          </Text>
          <SymbolView name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={12} weight="semibold" tintColor={colors.text} />
        </Pressable>
      ) : (
        <View />
      )}
      {controls ? (
        <TourSpot id="table.undo">
          <RoundButton
            icon={{ ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' }}
            label="Undo"
            onPress={controls.undo}
            disabled={!controls.canUndo || controls.busy}
          />
        </TourSpot>
      ) : (
        <View style={styles.round} />
      )}
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [styles.glass, styles.round, pressed && styles.pressed, disabled && styles.disabled]}>
      <SymbolView name={icon} size={17} weight="semibold" tintColor={colors.text} />
    </Pressable>
  );
}

const SIZE = 38;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  // Translucent dark glass over the felt, with a faint rim.
  glass: {
    backgroundColor: 'rgba(8,18,26,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  round: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  title: {
    flexShrink: 1,
    height: SIZE,
    borderRadius: SIZE / 2,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleText: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
});
