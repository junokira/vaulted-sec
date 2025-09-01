import { supabase } from "./App";

async function registerServiceWorkerAndSubscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn("Push notifications not supported.");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log("Service worker registered:", registration);

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn("Permission for notifications not granted.");
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: 'YOUR_VAPID_PUBLIC_KEY_HERE'
    });

    // Save subscription to database
    const { data: user, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        console.warn("User not logged in, cannot save push subscription.");
        return;
    }

    const { error } = await supabase.from('push_subscriptions').insert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))),
        auth: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth'))))
    });

    if (error) {
        console.error("Error saving push subscription:", error);
    }
    
  } catch (err) {
    console.error("Service worker or push subscription failed:", err);
  }
}

export { registerServiceWorkerAndSubscribePush };
