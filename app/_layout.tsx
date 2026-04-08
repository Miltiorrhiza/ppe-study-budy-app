import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import '../src/lib/i18n';
import { useAuthStore } from '../src/stores/auth.store';
import { setupOfflineSync } from '../src/lib/offline-queue';
import { setupNotificationHandler } from '../src/services/notification.service';
import {
  getSubscriptions,
  scheduleAutoSync,
  stopAllAutoSync,
} from '../src/services/ical-sync.service';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { isLoading, isAuthenticated, user, initialize } = useAuthStore();

  // Initialize auth store on app startup (reads persisted session from MMKV)
  useEffect(() => {
    initialize();
    setupNotificationHandler();
    const unsubscribe = setupOfflineSync();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      stopAllAutoSync();
      return;
    }

    let cancelled = false;
    getSubscriptions(user.id)
      .then((subs) => {
        if (cancelled) return;
        subs.forEach((sub) => scheduleAutoSync(sub.id));
      })
      .catch((err) => {
        console.warn('[RootLayout] Failed to schedule iCal auto-sync:', err);
      });

    return () => {
      cancelled = true;
      stopAllAutoSync();
    };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';

    if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    } else if (!isAuthenticated && inTabsGroup) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated, segments]);

  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="modals" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
