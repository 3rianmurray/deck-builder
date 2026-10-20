import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../components/AppIcon';
import { Text } from '../components/Text';
import { isPro, setProOverride, useProState } from '../lib/pro';
import type { ProOverride } from '../lib/pro';
import { versionLabel } from '../lib/version';
import { colors } from '../theme';

const SUPPORT = 'https://3rianmurray.github.io/shufflevale/';
const PRIVACY = 'https://3rianmurray.github.io/shufflevale/privacy.html';
const EMAIL = 'shufflevale@gmail.com';

/** The app's name and icon, which version is running (down to the update), and where to get help. */
/** The tester switch's choices: as the real purchase says, or acting as free or as Pro. */
const TESTER: [ProOverride | null, string][] = [
  [null, 'Real purchase'],
  ['free', 'Act as Free'],
  ['pro', 'Act as Pro'],
];

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const proState = useProState();
  const links: [string, string][] = [
    ['Support', SUPPORT],
    ['Privacy Policy', PRIVACY],
    [`Email ${EMAIL}`, `mailto:${EMAIL}`],
  ];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <AppIcon size={112} />
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
      {/* TestFlight and development builds only (never the App Store): try the free version and Pro without buying. */}
      {proState.testing ? (
        <View style={styles.tester}>
          <Text style={styles.testerTitle}>Tester · Pro is {isPro(proState) ? 'on' : 'off'}</Text>
          <View style={styles.testerRow}>
            {TESTER.map(([value, label]) => {
              const on = proState.override === value;
              return (
                <Pressable
                  key={label}
                  onPress={() => setProOverride(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.testerItem, on && styles.testerItemOn]}>
                  <Text style={[styles.testerText, on && { color: colors.accentText }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.testerNote}>Only in TestFlight. Real purchases here are free (Apple’s test store).</Text>
        </View>
      ) : null}
      <Text style={styles.footnote}>© 2026 Brian Murray</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { alignItems: 'center', padding: 24, paddingTop: 36 },
  name: { color: colors.text, fontSize: 26, fontWeight: '700', marginTop: 16 },
  tagline: { color: colors.textMuted, fontSize: 15, marginTop: 4 },
  version: { color: colors.textMuted, fontSize: 13, marginTop: 14, textAlign: 'center' },
  links: { alignSelf: 'stretch', backgroundColor: colors.surface, borderRadius: 14, marginTop: 28 },
  link: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  linkDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  linkText: { flex: 1, color: colors.accent, fontSize: 16, fontWeight: '600' },
  chevron: { color: colors.textMuted, fontSize: 20 },
  footnote: { color: colors.textMuted, fontSize: 12, marginTop: 24 },
  tester: { alignSelf: 'stretch', marginTop: 28, padding: 14, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, gap: 10 },
  testerTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  testerRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 10, padding: 3 },
  testerItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  testerItemOn: { backgroundColor: colors.accent },
  testerText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  testerNote: { color: colors.textMuted, fontSize: 12 },
});
