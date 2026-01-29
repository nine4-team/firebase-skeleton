import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { isAuthBypassEnabled } from '../../src/auth/authConfig';

export default function AuthLayout() {
  const router = useRouter();
  const params = useLocalSearchParams<{ preview?: string }>();
  const preview = params?.preview === '1' || params?.preview === 'true';

  useEffect(() => {
    // In guest/bypass mode we default to the app UI, unless explicitly previewing auth.
    if (isAuthBypassEnabled && !preview) {
      router.replace('/(tabs)');
    }
  }, [preview]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
