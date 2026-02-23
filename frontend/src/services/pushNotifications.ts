const API_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3000/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/push/vapid-public-key`);
    if (!res.ok) return null;
    const { publicKey } = await res.json();
    return publicKey;
  } catch {
    return null;
  }
}

async function saveSubscriptionToBackend(
  playerId: string,
  subscription: PushSubscription
): Promise<void> {
  const sub = subscription.toJSON();
  await fetch(`${API_URL}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId,
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys?.p256dh, auth: sub.keys?.auth },
      },
    }),
  });
}

let pushSubscribed = false;

export function isPushSubscribed(): boolean {
  return pushSubscribed;
}

export async function initPushNotifications(playerId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return;

    const vapidPublicKey = await getVapidPublicKey();
    if (!vapidPublicKey) {
      // Server not configured for push — fall through, basic Notification API still works
      return;
    }

    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await saveSubscriptionToBackend(playerId, existing);
      pushSubscribed = true;
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    await saveSubscriptionToBackend(playerId, subscription);
    pushSubscribed = true;
  } catch (err) {
    console.error('Push notification setup failed:', err);
  }
}
