// Expo push service: https://docs.expo.dev/push-notifications/sending-notifications/
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export type PushOutcome = 'sent' | 'unregistered' | 'failed';

interface Ticket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/** Sends messages in batches and reports an outcome per recipient token. */
export async function sendPushes(messages: PushMessage[]): Promise<Map<string, PushOutcome>> {
  const outcomes = new Map<string, PushOutcome>();
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default' }))),
    });
    if (!res.ok) {
      console.error(`Expo push failed (${res.status}): ${await res.text()}`);
      batch.forEach((m) => outcomes.set(m.to, 'failed'));
      continue;
    }
    const { data } = (await res.json()) as { data: Ticket[] };
    batch.forEach((m, j) => {
      const ticket = data[j];
      if (ticket?.status === 'ok') outcomes.set(m.to, 'sent');
      else if (ticket?.details?.error === 'DeviceNotRegistered') outcomes.set(m.to, 'unregistered');
      else {
        console.error(`Push to ${m.to} failed: ${ticket?.message ?? 'no ticket'}`);
        outcomes.set(m.to, 'failed');
      }
    });
  }
  return outcomes;
}
