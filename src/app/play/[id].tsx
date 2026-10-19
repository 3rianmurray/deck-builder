import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DeckTable } from '../../components/PlayTable';
import { TableTopBar } from '../../components/TableTopBar';
import type { TableControls } from '../../components/TableTopBar';
import { TabletopSurface } from '../../components/Tabletop';
import { playThemeKey, usePlayTheme } from '../../lib/playThemes';
import { clothShades, themeOf } from '../../lib/tableThemes';
import { colors } from '../../theme';

export default function PlayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [controls, setControls] = useState<TableControls | null>(null);
  const theme = themeOf(usePlayTheme(playThemeKey(id)));
  return (
    <View style={[styles.screen, { backgroundColor: clothShades(theme).mid }]}>
      {/* The cloth runs under the top bar too, as one surface. */}
      <TabletopSurface theme={theme} />
      <TableTopBar controls={controls} />
      <DeckTable deckId={id} onControls={setControls} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.felt },
});
