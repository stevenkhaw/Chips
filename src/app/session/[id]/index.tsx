import { useLocalSearchParams } from 'expo-router';
import { Headline, Screen } from '@/components/ui';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <Headline>Session {id}</Headline>
    </Screen>
  );
}
