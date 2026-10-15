import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DeckTable } from '../../components/PlayTable';
import { TableTopBar } from '../../components/TableTopBar';
import type { TableControls } from '../../components/TableTopBar';
import { TabletopSurface } from '../../components/Tabletop';
import { colors } from '../../theme';

export default function PlayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [controls, setControls] = useState<TableControls | null>(null);
  return (
    <View style={styles.screen}>
      {/* The cloth runs under the top bar too, as one surface. */}
      <TabletopSurface />
      <TableTopBar controls={controls} />
      <DeckTable deckId={id} onControls={setControls} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.felt },
});
