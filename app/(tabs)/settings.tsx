import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  getSubscriptions,
  removeSubscription,
  syncNow,
} from '../../src/services/ical-sync.service';
import { useAuthStore } from '../../src/stores/auth.store';
import { useNotificationStore } from '../../src/stores/notification.store';
import type { LmsIntegration } from '../../src/types';

function formatDate(date: Date | null): string {
  if (!date) return 'Never';
  return date.toLocaleDateString('en-AU', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const { pushEnabled, setPushEnabled } = useNotificationStore();

  const [subscriptions, setSubscriptions] = useState<LmsIntegration[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const loadSubscriptions = useCallback(async () => {
    if (!user?.id) return;
    setLoadingSubs(true);
    try {
      const subs = await getSubscriptions(user.id);
      setSubscriptions(subs);
    } catch (err) {
      console.warn('[Settings] loadSubscriptions error:', err);
    } finally {
      setLoadingSubs(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  async function handleSyncNow(integrationId: string) {
    setSyncingId(integrationId);
    try {
      const result = await syncNow(integrationId);
      Alert.alert(
        'Sync Complete',
        `${result.created} task${result.created !== 1 ? 's' : ''} imported${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}.`
      );
      await loadSubscriptions();
    } catch (err) {
      Alert.alert('Sync Failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSyncingId(null);
    }
  }

  async function handleRemove(integrationId: string) {
    Alert.alert(
      'Remove Calendar',
      'This will remove the calendar connection. Already imported tasks will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeSubscription(integrationId);
              await loadSubscriptions();
            } catch (err) {
              Alert.alert('Error', 'Failed to remove. Please try again.');
            }
          },
        },
      ]
    );
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* ── User Info ── */}
      {user ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <View style={styles.card}>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            {user.university ? (
              <Text style={styles.userUniversity}>{user.university}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* ── Calendar Sync ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CALENDAR SYNC</Text>

        {loadingSubs ? (
          <ActivityIndicator color="#FF3B30" style={{ marginVertical: 16 }} />
        ) : (
          <>
            {subscriptions.map((sub) => (
              <View key={sub.id} style={styles.card}>
                <View style={styles.subRow}>
                  <View style={styles.subInfo}>
                    <Text style={styles.subLabel}>{sub.label ?? 'Calendar'}</Text>
                    <Text style={styles.subMeta}>
                      Last synced: {formatDate(sub.lastSyncedAt)}
                    </Text>
                  </View>
                  <View style={styles.subActions}>
                    <TouchableOpacity
                      onPress={() => handleSyncNow(sub.id)}
                      disabled={syncingId === sub.id}
                      style={styles.syncButton}
                    >
                      {syncingId === sub.id ? (
                        <ActivityIndicator color="#FF3B30" size="small" />
                      ) : (
                        <Text style={styles.syncButtonText}>Sync</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleRemove(sub.id)}
                      style={styles.removeButton}
                    >
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}

            <TouchableOpacity
              style={styles.connectButton}
              onPress={() => router.push('/modals/ical-connect')}
              activeOpacity={0.8}
            >
              <Text style={styles.connectButtonText}>+ Connect School Calendar</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Notifications ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Push Notifications</Text>
            <TouchableOpacity
              style={[styles.toggle, pushEnabled && styles.toggleOn]}
              onPress={() => setPushEnabled(!pushEnabled)}
              activeOpacity={0.8}
            >
              <View style={[styles.toggleThumb, pushEnabled && styles.toggleThumbOn]} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Subscription ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SUBSCRIPTION</Text>
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/modals/subscription')}
          activeOpacity={0.8}
        >
          <View style={styles.rowWithChevron}>
            <Text style={styles.rowLabel}>Manage Subscription</Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Sign Out ── */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  content: { paddingBottom: 48 },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#FFFFFF' },
  section: { marginTop: 24, paddingHorizontal: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#636366',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  userName: { fontSize: 17, fontWeight: '600', color: '#FFFFFF', marginBottom: 4 },
  userEmail: { fontSize: 14, color: '#8E8E93', marginBottom: 2 },
  userUniversity: { fontSize: 13, color: '#636366' },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subInfo: { flex: 1 },
  subLabel: { fontSize: 15, fontWeight: '500', color: '#FFFFFF', marginBottom: 4 },
  subMeta: { fontSize: 12, color: '#636366' },
  subActions: { flexDirection: 'row', gap: 8 },
  syncButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
    minWidth: 52,
    alignItems: 'center',
  },
  syncButtonText: { color: '#FF3B30', fontSize: 13, fontWeight: '600' },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
  },
  removeButtonText: { color: '#636366', fontSize: 13 },
  connectButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FF3B30',
    borderStyle: 'dashed',
  },
  connectButtonText: { color: '#FF3B30', fontSize: 15, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 15, color: '#FFFFFF' },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3A3A3C',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleOn: { backgroundColor: '#34C759' },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  toggleThumbOn: { alignSelf: 'flex-end' },
  rowWithChevron: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: 15, color: '#FFFFFF' },
  chevron: { fontSize: 20, color: '#3A3A3C' },
  signOutButton: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' },
});
