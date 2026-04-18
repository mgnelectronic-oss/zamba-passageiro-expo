import { Redirect } from 'expo-router';
import { useAppBootstrap } from '@/contexts/AppBootstrapContext';

export default function Index() {
  const { user } = useAppBootstrap();

  if (!user) {
    return <Redirect href="/auth" />;
  }

  return <Redirect href="/(tabs)" />;
}
