import { SymbolView } from 'expo-symbols';
import type { SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '../theme';

interface Props {
  /** SF Symbol on iOS, Material Symbol on Android and web. */
  icon: SymbolViewProps['name'];
  /** Read out by screen readers, since the button shows no text. */
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

/** A round button showing just an icon. */
export function IconButton({ icon, label, onPress, variant = 'secondary', disabled }: Props) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        (pressed || disabled) && { opacity: disabled ? 0.35 : 0.75 },
      ]}>
      <SymbolView name={icon} size={26} tintColor={primary ? colors.accentText : colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
});
