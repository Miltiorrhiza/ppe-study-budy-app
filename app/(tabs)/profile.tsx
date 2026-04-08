import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/stores/auth.store';
import { useNotificationStore } from '../../src/stores/notification.store';
import {
  getSubscriptions,
  removeSubscription,
  scheduleAutoSync,
  stopAutoSync,
  syncNow,
} from '../../src/services/ical-sync.service';
import { getSubscription, syncSubscription } from '../../src/services/subscription.service';
import { setLanguage, SupportedLanguage } from '../../src/lib/i18n';
import type { Course, LmsIntegration } from '../../src/types';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const userId = user?.id ?? '';
  const { pushEnabled, setPushEnabled, initialize } = useNotificationStore();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(user?.name ?? '');
  const [university, setUniversity] = useState(user?.university ?? '');
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseInput, setCourseInput] = useState('');
  const [icalSubs, setIcalSubs] = useState<LmsIntegration[]>([]);
  const [plan, setPlan] = useState<'free' | 'pro'>('free');
  const [proEnabled, setProEnabled] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [language, setLanguageState] = useState<SupportedLanguage>('en');
  const expiryNotified = useRef(false);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('name, university, language')
        .eq('id', userId)
        .single();
      if (profile) {
        setName(profile.name ?? '');
        setUniversity(profile.university ?? '');
        const lang = profile.language === 'zh' ? 'zh' : 'en';
        setLanguageState(lang);
        setLanguage(lang);
      }

      const { data: courseRows } = await supabase
        .from('courses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      setCourses(
        (courseRows ?? []).map((row: any) => ({
          id: row.id,
          userId: row.user_id,
          name: row.name,
          color: row.color ?? null,
          createdAt: new Date(row.created_at),
        }))
      );

      const subscriptions = await getSubscriptions(userId);
      setIcalSubs(subscriptions);
      subscriptions.forEach((sub) => scheduleAutoSync(sub.id));

      const sub = await getSubscription(userId);
      setPlan(sub.plan);
      setProEnabled(sub.plan === 'pro');
      setExpiresAt(sub.expiresAt);
      if (
        sub.expiresAt &&
        sub.expiresAt.getTime() < Date.now() &&
        sub.plan === 'free' &&
        !expiryNotified.current
      ) {
        Alert.alert('Subscription expired', 'Your subscription has expired and was downgraded to Free.');
        expiryNotified.current = true;
      }
    } catch (err) {
      console.warn('[Profile] loadProfile error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      initialize(userId).catch(() => {});
      loadProfile();
    }
  }, [userId, initialize, loadProfile]);

  async function handleSaveProfile() {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ name, university })
        .eq('id', userId);
      if (error) throw error;
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch {
      Alert.alert('Error', 'Failed to update profile.');
    }
  }

  async function handleAddCourse() {
    if (!courseInput.trim()) return;
    try {
      const { data, error } = await supabase
        .from('courses')
        .insert({ user_id: userId, name: courseInput.trim() })
        .select()
        .single();
      if (error) throw error;
      setCourses((prev) => [
        ...prev,
        {
          id: data.id,
          userId: data.user_id,
          name: data.name,
          color: data.color ?? null,
          createdAt: new Date(data.created_at),
        },
      ]);
      setCourseInput('');
    } catch {
      Alert.alert('Error', 'Failed to add course.');
    }
  }

  async function handleDeleteCourse(id: string) {
    try {
      const { error } = await supabase.from('courses').delete().eq('id', id);
      if (error) throw error;
      setCourses((prev) => prev.filter((c) => c.id !== id));
    } catch {
      Alert.alert('Error', 'Failed to delete course.');
    }
  }

  async function handleSyncSubscription() {
    try {
      const previousPlan = plan;
      const sub = await syncSubscription(userId);
      setPlan(sub.plan);
      setProEnabled(sub.plan === 'pro');
      setExpiresAt(sub.expiresAt);
      if (
        previousPlan === 'pro' &&
        sub.expiresAt &&
        sub.expiresAt.getTime() < Date.now() &&
        sub.plan === 'free'
      ) {
        Alert.alert('Subscription expired', 'Your subscription has expired and was downgraded to Free.');
        expiryNotified.current = true;
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to sync subscription.');
    }
  }

  async function handleLanguageChange(lang: SupportedLanguage) {
    setLanguageState(lang);
    setLanguage(lang);
    await supabase.from('user_profiles').update({ language: lang }).eq('id', userId);
  }

  async function handleDeleteSubscription(id: string) {
    try {
      await removeSubscription(id);
      stopAutoSync(id);
      await loadProfile();
    } catch {
      Alert.alert('Error', 'Failed to remove subscription.');
    }
  }

  async function handleManualSync(integrationId: string) {
    try {
      const result = await syncNow(integrationId);
      Alert.alert('Sync complete', `Created ${result.created}, skipped ${result.skipped}`);
      await loadProfile();
    } catch {
      Alert.alert('Error', 'Failed to sync calendar.');
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#FF3B30" />
      </View>
    );
  }

  const expiryLabel = expiresAt
    ? expiresAt.getTime() < Date.now()
      ? 'Expired'
      : 'Renews'
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>Profile</Text>

      <Section title="Account">
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor="#636366"
        />
        <Text style={styles.label}>University</Text>
        <TextInput
          style={styles.input}
          value={university}
          onChangeText={setUniversity}
          placeholder="University"
          placeholderTextColor="#636366"
        />
        <Text style={styles.emailText}>{user?.email ?? ''}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handleSaveProfile}>
          <Text style={styles.primaryButtonText}>Save Profile</Text>
        </TouchableOpacity>
      </Section>

      <Section title="Courses">
        <View style={styles.courseInputRow}>
          <TextInput
            style={[styles.input, styles.courseInput]}
            value={courseInput}
            onChangeText={setCourseInput}
            placeholder="Add course"
            placeholderTextColor="#636366"
          />
          <TouchableOpacity style={styles.iconButton} onPress={handleAddCourse}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        {courses.map((course) => (
          <View key={course.id} style={styles.courseRow}>
            <Text style={styles.courseName}>{course.name}</Text>
            <TouchableOpacity onPress={() => handleDeleteCourse(course.id)}>
              <Ionicons name="trash" size={16} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        ))}
      </Section>

      <Section title="Notifications">
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Push notifications</Text>
          <Switch
            value={pushEnabled}
            onValueChange={(value) => setPushEnabled(value)}
            thumbColor={pushEnabled ? '#FF3B30' : '#8E8E93'}
          />
        </View>
      </Section>

      <Section title="Language">
        <View style={styles.segmentRow}>
          <TouchableOpacity
            style={[styles.segmentButton, language === 'en' && styles.segmentButtonActive]}
            onPress={() => handleLanguageChange('en')}
          >
            <Text
              style={[styles.segmentText, language === 'en' && styles.segmentTextActive]}
            >
              English
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, language === 'zh' && styles.segmentButtonActive]}
            onPress={() => handleLanguageChange('zh')}
          >
            <Text
              style={[styles.segmentText, language === 'zh' && styles.segmentTextActive]}
            >
              中文
            </Text>
          </TouchableOpacity>
        </View>
      </Section>

      <Section title="Calendar Sync">
        {icalSubs.length > 0 ? (
          icalSubs.map((sub) => (
            <View key={sub.id} style={styles.subRow}>
              <View style={styles.subInfo}>
                <Text style={styles.subTitle}>{sub.label ?? 'Calendar'}</Text>
                <Text style={styles.subMeta}>
                  Last sync {sub.lastSyncedAt ? sub.lastSyncedAt.toLocaleString('en-AU') : 'Never'}
                </Text>
              </View>
              <View style={styles.subActions}>
                <TouchableOpacity onPress={() => handleManualSync(sub.id)}>
                  <Ionicons name="refresh" size={16} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteSubscription(sub.id)}>
                  <Ionicons name="trash" size={16} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No calendars connected</Text>
        )}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/modals/ical-connect')}
          >
            <Text style={styles.secondaryButtonText}>Connect School Calendar</Text>
          </TouchableOpacity>
        </View>
      </Section>

      <Section title="Subscription">
        <Text style={styles.planText}>Current plan: {plan.toUpperCase()}</Text>
        {expiresAt ? (
          <Text style={styles.subMeta}>
            {expiryLabel} {expiresAt.toLocaleDateString('en-AU')}
          </Text>
        ) : null}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/modals/subscription')}
          >
            <Text style={styles.secondaryButtonText}>Manage Subscription</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleSyncSubscription}>
            <Text style={styles.secondaryButtonText}>Sync Status</Text>
          </TouchableOpacity>
        </View>
      </Section>

      <Section title="AI Auto Sync LMS">
        {proEnabled ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/modals/ai-agent-sync')}
          >
            <Text style={styles.primaryButtonText}>Start AI Sync</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/modals/subscription')}
          >
            <Text style={styles.secondaryButtonText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        )}
      </Section>

      <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 40,
    gap: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  section: {
    backgroundColor: '#111114',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  sectionTitle: {
    fontSize: 12,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  sectionBody: {
    gap: 12,
  },
  label: {
    color: '#8E8E93',
    fontSize: 12,
  },
  input: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  emailText: {
    color: '#8E8E93',
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#1C1C1E',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    flex: 1,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  courseInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  courseInput: {
    flex: 1,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  courseName: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segmentButton: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  segmentButtonActive: {
    backgroundColor: '#FF3B30',
    borderColor: '#FF3B30',
  },
  segmentText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  subInfo: {
    flex: 1,
    marginRight: 12,
  },
  subTitle: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  subMeta: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 4,
  },
  subActions: {
    flexDirection: 'row',
    gap: 12,
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 13,
  },
  planText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  logoutButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  logoutText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
});
