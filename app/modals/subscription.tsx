import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import {
  getOfferings,
  initPurchases,
  purchasePackage,
  restorePurchases,
} from '../../src/services/subscription.service';
import { useAuthStore } from '../../src/stores/auth.store';

export default function SubscriptionModal() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        await initPurchases(userId);
        const current = await getOfferings();
        setOffering(current);
        setSelectedPackage(current?.availablePackages?.[0] ?? null);
      } catch (err) {
        console.warn('[Subscription] load offering error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  async function handlePurchase() {
    if (!selectedPackage) return;
    setPurchasing(true);
    try {
      await purchasePackage(userId, selectedPackage);
      Alert.alert('Success', 'Subscription activated.');
      router.back();
    } catch {
      Alert.alert('Error', 'Purchase failed. Please try again.');
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setPurchasing(true);
    try {
      await restorePurchases(userId);
      Alert.alert('Restored', 'Subscription restored.');
    } catch {
      Alert.alert('Error', 'Restore failed.');
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navButton} hitSlop={8}>
          <Ionicons name="close" size={20} color="#8E8E93" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Subscription</Text>
        <View style={styles.navButton} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FF3B30" />
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.planCard}>
            <Text style={styles.planTitle}>Free</Text>
            <Text style={styles.planSubtitle}>Basic task tracking</Text>
            <Text style={styles.planFeature}>• Standard focus timer</Text>
            <Text style={styles.planFeature}>• Limited stats</Text>
          </View>

          <View style={[styles.planCard, styles.planCardPro]}>
            <Text style={styles.planTitle}>Pro</Text>
            <Text style={styles.planSubtitle}>Unlock everything</Text>
            <Text style={styles.planFeature}>• Custom focus lengths</Text>
            <Text style={styles.planFeature}>• Unlimited notes</Text>
            <Text style={styles.planFeature}>• Advanced stats</Text>
            <Text style={styles.planFeature}>• AI LMS sync</Text>
          </View>

          {offering?.availablePackages?.length ? (
            <View style={styles.packageList}>
              {offering.availablePackages.map((pkg) => (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={[
                    styles.packageRow,
                    selectedPackage?.identifier === pkg.identifier && styles.packageRowActive,
                  ]}
                  onPress={() => setSelectedPackage(pkg)}
                >
                  <View>
                    <Text style={styles.packageTitle}>{pkg.product.title}</Text>
                    <Text style={styles.packagePrice}>{pkg.product.priceString}</Text>
                  </View>
                  {selectedPackage?.identifier === pkg.identifier ? (
                    <Ionicons name="checkmark-circle" size={20} color="#FF3B30" />
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No purchase options available.</Text>
          )}

          <TouchableOpacity style={styles.primaryButton} onPress={handlePurchase} disabled={purchasing}>
            {purchasing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Upgrade to Pro</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleRestore}>
            <Text style={styles.secondaryButtonText}>Restore Purchases</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
  },
  navButton: {
    minWidth: 44,
    alignItems: 'center',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  planCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  planCardPro: {
    borderColor: '#FF3B30',
  },
  planTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  planSubtitle: {
    marginTop: 4,
    color: '#8E8E93',
  },
  planFeature: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 13,
  },
  packageList: {
    gap: 10,
  },
  packageRow: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  packageRowActive: {
    borderColor: '#FF3B30',
  },
  packageTitle: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  packagePrice: {
    color: '#8E8E93',
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#2C2C2E',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyText: {
    color: '#8E8E93',
  },
});
