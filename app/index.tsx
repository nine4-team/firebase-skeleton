import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/auth/authStore';
import { isAuthBypassEnabled } from '../src/auth/authConfig';
import { LoadingScreen } from '../src/components/LoadingScreen';

export default function Index() {
  const router = useRouter();
  const { user, isInitialized } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) return;

    if (user || isAuthBypassEnabled) {
      router.replace('/(tabs)');
    } else {
      router.replace('/(auth)/sign-in');
    }
  }, [user, isInitialized]);

  return <LoadingScreen />;
}

