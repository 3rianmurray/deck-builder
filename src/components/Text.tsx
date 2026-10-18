import { Text as NativeText, useWindowDimensions } from 'react-native';
import type { TextProps } from 'react-native';

/**
 * The most the app's text grows with the phone's text size setting. Past this, buttons, pills and tiles would
 * cut their words off, so it stops here (iOS's largest everyday size is about 1.35×).
 */
export const MAX_TEXT_SCALE = 1.25;

/**
 * Text that follows the phone's text size setting (up to `MAX_TEXT_SCALE`), and is laid out afresh when the
 * setting changes. iOS otherwise keeps text measured at the old size until the screen is rebuilt, leaving words
 * off center in their buttons.
 */
export function Text(props: TextProps) {
  const { fontScale } = useWindowDimensions();
  return <NativeText key={fontScale} maxFontSizeMultiplier={MAX_TEXT_SCALE} {...props} />;
}
