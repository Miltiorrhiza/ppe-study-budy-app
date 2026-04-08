import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { Alert, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export function setupNotificationHandler(): void {
  if (Platform.OS === 'web') {
    return;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    const taskId = response.notification.request.content.data?.taskId as string | undefined;
    if (taskId) {
      const url = Linking.createURL(`/modals/task-detail?id=${taskId}`);
      Linking.openURL(url).catch((err) =>
        console.warn('[NotificationService] Failed to open deep link:', err)
      );
    }
  });
}

export async function requestPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') {
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Enable notifications',
      'To receive task reminders, please enable notifications in your system settings.'
    );
  }
  return status === 'granted';
}

export async function scheduleReminder(
  taskId: string,
  remindAt: Date,
  title: string
): Promise<string> {
  if (remindAt <= new Date()) {
    return '';
  }

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: `Reminder: ${title}`,
      body: `Due: ${remindAt.toLocaleDateString()}`,
      data: { taskId },
    },
    trigger: {
      date: remindAt,
    },
  });

  return notificationId;
}

export async function cancelReminder(notificationId: string): Promise<void> {
  if (!notificationId) return;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  const granted = await requestPermission();
  if (!granted) {
    console.warn('[NotificationService] Push permission not granted, skipping token registration.');
    return;
  }

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const pushToken = tokenData.data;

      const { error } = await supabase
        .from('user_profiles')
        .update({ push_token: pushToken })
        .eq('id', userId);

      if (error) {
        throw new Error(error.message);
      }

      return;
    } catch (err) {
      console.warn(`[NotificationService] registerPushToken attempt ${attempt} failed:`, err);
      if (attempt === MAX_RETRIES) {
        console.warn('[NotificationService] Max retries reached, push token registration skipped.');
      }
    }
  }
}
