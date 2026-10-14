import { useLocalSearchParams } from 'expo-router';

import { DeckTable } from '../../components/PlayTable';

export default function PlayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DeckTable deckId={id} />;
}
