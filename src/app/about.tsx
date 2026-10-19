import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '../components/Text';
import { versionLabel } from '../lib/version';
import { colors } from '../theme';

const SUPPORT = 'https://3rianmurray.github.io/shufflevale/';
const PRIVACY = 'https://3rianmurray.github.io/shufflevale/privacy.html';
const EMAIL = 'shufflevale@gmail.com';

/** The app's name and icon, which version is running (down to the update), and where to get help. */
export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const links: [string, string][] = [
    ['Support', SUPPORT],
    ['Privacy Policy', PRIVACY],
    [`Email ${EMAIL}`, `mailto:${EMAIL}`],
  ];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <Image source={require('../../assets/about-icon.png')} style={styles.icon} accessibilityIgnoresInvertColors />
      <Text style={styles.name}>Shufflevale</Text>
      <Text style={styles.tagline}>Your own cards, ready to play</Text>
      <Text style={styles.version} selectable>
        {versionLabel()}
      </Text>
      <View style={styles.links}>
        {links.map(([label, url], i) => (
          <Pressable
            key={url}
            onPress={() => Linking.openURL(url).catch(() => {})}
            accessibilityRole="link"
            style={({ pressed }) => [styles.link, i > 0 && styles.linkDivider, pressed && { opacity: 0.6 }]}>
            <Text style={styles.linkText}>{label}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.footnote}>© 2026 Brian Murray</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { alignItems: 'center', padding: 24, paddingTop: 36 },
  icon: { width: 112, height: 112, borderRadius: 26 },
  name: { color: colors.text, fontSize: 26, fontWeight: '700', marginTop: 16 },
  tagline: { color: colors.textMuted, fontSize: 15, marginTop: 4 },
  version: { color: colors.textMuted, fontSize: 13, marginTop: 14, textAlign: 'center' },
  links: { alignSelf: 'stretch', backgroundColor: colors.surface, borderRadius: 14, marginTop: 28 },
  link: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  linkDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  linkText: { flex: 1, color: colors.accent, fontSize: 16, fontWeight: '600' },
  chevron: { color: colors.textMuted, fontSize: 20 },
  footnote: { color: colors.textMuted, fontSize: 12, marginTop: 24 },
});
