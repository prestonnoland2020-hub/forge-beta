/* WHICH RAIL SELLS THE SUBSCRIPTION.

   App Store Review Guideline 3.1.1: an app may not use its own mechanism to
   unlock features. So the same Forge Pro is sold two ways — Apple's In-App
   Purchase inside the iOS app, Stripe everywhere else — and this module is the
   only place that decides which. The entitlement it produces is identical
   either way; nothing downstream knows or cares who took the payment.

   Capacitor injects `window.Capacitor` into the native WebView. On the web it
   is simply absent, which is the whole detection. */

type CapacitorGlobal = {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, unknown>;
};

const capacitor = (): CapacitorGlobal | undefined =>
  (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;

export type Platform = 'ios' | 'android' | 'web';

export function platform(): Platform {
  const native = capacitor();
  const name = native?.getPlatform?.();
  return name === 'ios' || name === 'android' ? name : 'web';
}

export const isNative = (): boolean => Boolean(capacitor()?.isNativePlatform?.());

/* Apple takes the payment inside the iOS app. Everywhere else — including the
   same account opened in Safari on the same phone — Stripe does. */
export const billingRail = (): 'apple' | 'stripe' => (platform() === 'ios' ? 'apple' : 'stripe');

/* The StoreKit bridge, if this build has one. Kept behind an interface so the
   app runs identically in a browser, in TestFlight before the plugin is wired,
   and in the shipped binary — a missing plugin produces an honest message, not
   a crash on the billing screen. */
export type StoreProduct = { id: string; price: string; title: string };
export type StoreBridge = {
  getProducts: (ids: string[]) => Promise<StoreProduct[]>;
  purchase: (id: string) => Promise<{ transactionId: string }>;
  restore: () => Promise<{ transactionId: string } | null>;
};

export function storeBridge(): StoreBridge | null {
  const plugin = capacitor()?.Plugins?.ForgeStore as StoreBridge | undefined;
  if (!plugin || typeof plugin.purchase !== 'function') return null;
  return plugin;
}

export const APPLE_PRODUCT_IDS = {
  pro_monthly: 'com.forgetraining.forge.pro.monthly',
  pro_annual: 'com.forgetraining.forge.pro.annual',
} as const;
