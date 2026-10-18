import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SandboxBoard } from '../../components/SandboxTable';
import { TableTopBar } from '../../components/TableTopBar';
import type { TableControls } from '../../components/TableTopBar';
import { tourEvent } from '../../lib/tour';
import { colors } from '../../theme';

/** A sandbox table: the table fills the screen, with its top bar (back, its name and menu, undo) over it. */
export default function SandboxScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [controls, setControls] = useState<TableControls | null>(null);
  // The walkthrough may be waiting for a table to open.
  useEffect(() => tourEvent('tables-opened'), []);
  return (
    <View style={styles.screen}>
      <SandboxBoard id={id} onControls={setControls} />
      <View style={styles.bar} pointerEvents="box-none">
        <TableTopBar controls={controls} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.feltDeep },
  bar: { position: 'absolute', left: 0, right: 0, top: 0 },
});
