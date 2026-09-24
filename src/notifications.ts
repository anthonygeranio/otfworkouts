import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// URL of the deployed notifier Worker (see server/README.md), set in .env.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const ENABLED_KEY = 'notifications:enabled';
const TOKEN_KEY = 'notifications:token';

export const notificationsSupported = Platform.OS !== 'web';

// Show the banner even when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function isEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

async function callServer(method: 'POST' | 'DELETE', body: object) {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL is not set');
  const res = await fetch(`${API_URL}/devices`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
}

/** Asks for permission, gets this phone's push token and registers it. Returns a user-facing error, or null. */
export async function enableNotifications(): Promise<string | null> {
  if (!Device.isDevice) return 'Notifications need a real phone, not a simulator.';

  if (Platform.OS === 'android') {
    // Android 13+ requires a channel before a push token can be issued.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Daily workout',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'Notifications are turned off for Class Preview in your phone settings.';

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return 'This build has no EAS project id yet (run `npx eas-cli init`).';

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await callServer('POST', { token, timezone });
    await AsyncStorage.multiSet([
      [ENABLED_KEY, '1'],
      [TOKEN_KEY, token],
    ]);
    return null;
  } catch (e) {
    return `Couldn't turn on notifications: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Re-sends the token on launch, since tokens and time zones can change. */
export async function refreshRegistration() {
  if (!(await isEnabled())) return;
  const error = await enableNotifications();
  if (error) console.warn(error);
}

export async function disableNotifications(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) await callServer('DELETE', { token });
    await AsyncStorage.multiRemove([ENABLED_KEY, TOKEN_KEY]);
    return null;
  } catch (e) {
    return `Couldn't turn off notifications: ${e instanceof Error ? e.message : String(e)}`;
  }
}
