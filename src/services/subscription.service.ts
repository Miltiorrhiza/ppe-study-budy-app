import Purchases, { PurchasesPackage, CustomerInfo, PurchasesOffering } from 'react-native-purchases';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Plan, Subscription } from '../types';

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '';
const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT ?? 'pro';

function planFromCustomerInfo(info: CustomerInfo): Plan {
  return info.entitlements.active[ENTITLEMENT_ID] ? 'pro' : 'free';
}

function providerFromPlatform(): 'app_store' | 'google_play' | 'stripe' | null {
  if (Platform.OS === 'ios') return 'app_store';
  if (Platform.OS === 'android') return 'google_play';
  if (Platform.OS === 'web') return 'stripe';
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSubscriptionRow(row: any): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    plan: row.plan,
    provider: row.provider ?? null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    revenuecatUserId: row.revenuecat_user_id ?? null,
    updatedAt: new Date(row.updated_at),
  };
}

async function upsertSubscription(userId: string, info: CustomerInfo): Promise<Subscription> {
  const plan = planFromCustomerInfo(info);
  const entitlement = info.entitlements.active[ENTITLEMENT_ID];
  const expiresAt = entitlement?.expirationDate ? new Date(entitlement.expirationDate) : null;

  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan,
        provider: providerFromPlatform(),
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        revenuecat_user_id: info.originalAppUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) throw error;

  return mapSubscriptionRow(data);
}

export async function initPurchases(userId: string): Promise<void> {
  if (!API_KEY) {
    console.warn('[SubscriptionService] RevenueCat API key not configured.');
    return;
  }
  Purchases.configure({ apiKey: API_KEY, appUserID: userId });
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
  if (!API_KEY) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

export async function purchasePackage(userId: string, pkg: PurchasesPackage): Promise<Subscription> {
  if (!API_KEY) {
    throw new Error('RevenueCat is not configured.');
  }
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return upsertSubscription(userId, customerInfo);
}

export async function restorePurchases(userId: string): Promise<Subscription> {
  if (!API_KEY) {
    throw new Error('RevenueCat is not configured.');
  }
  const customerInfo = await Purchases.restorePurchases();
  return upsertSubscription(userId, customerInfo);
}

export async function syncSubscription(userId: string): Promise<Subscription> {
  if (!API_KEY) {
    return getSubscription(userId);
  }
  const customerInfo = await Purchases.getCustomerInfo();
  return upsertSubscription(userId, customerInfo);
}

export async function getSubscription(userId: string): Promise<Subscription> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      const { data: created, error: insertError } = await supabase
        .from('subscriptions')
        .insert({ user_id: userId, plan: 'free' })
        .select()
        .single();
      if (insertError) throw insertError;
      return mapSubscriptionRow(created);
    }
    throw error;
  }

  let row = data;
  if (row.expires_at && row.plan === 'pro') {
    const expiresAt = new Date(row.expires_at);
    if (expiresAt.getTime() < Date.now()) {
      const { data: updated, error: updateError } = await supabase
        .from('subscriptions')
        .update({ plan: 'free', updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .select()
        .single();
      if (updateError) throw updateError;
      row = updated;
    }
  }

  return mapSubscriptionRow(row);
}

export async function isProUser(userId: string): Promise<boolean> {
  const sub = await getSubscription(userId);
  return sub.plan === 'pro';
}
