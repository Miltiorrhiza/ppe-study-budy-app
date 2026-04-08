import { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/auth.store';
import { useDashboardStore } from '../../src/stores/dashboard.store';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-AU', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatDue(date: Date): string {
  const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

function formatFocusTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function greet(name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 18) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { nextDeadline, todayTaskCount, todayFocusSec, upcomingTasks, isLoading, load } =
    useDashboardStore();

  useEffect(() => {
    if (user?.id) load(user.id);
  }, [user?.id]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.dateText}>{formatDate(new Date())}</Text>
          <Text style={styles.greetText}>{greet(user?.name ?? 'there')}</Text>
        </View>
        <TouchableOpacity
          style={styles.bellButton}
          onPress={() => router.push('/settings')}
          hitSlop={8}
        >
          <Text style={styles.bellIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#FF3B30" style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* ── Next Deadline Card ── */}
          {nextDeadline ? (
            <View style={styles.deadlineCard}>
              <View style={styles.deadlineTop}>
                <View>
                  <Text style={styles.deadlineLabel}>Next deadline</Text>
                  <Text style={styles.deadlineTitle} numberOfLines={1}>
                    {nextDeadline.title}
                  </Text>
                  {nextDeadline.courseId ? (
                    <Text style={styles.deadlineCourse}>{nextDeadline.courseId}</Text>
                  ) : null}
                </View>
                <View style={styles.deadlineBadge}>
                  <Text style={styles.deadlineBadgeText}>{formatDue(nextDeadline.dueAt)}</Text>
                </View>
              </View>
              <View style={styles.deadlineActions}>
                <TouchableOpacity
                  style={styles.viewButton}
                  onPress={() => router.push(`/modals/task-detail?id=${nextDeadline.id}`)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.viewButtonText}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.focusButton}
                  onPress={() => router.push(`/modals/focus-timer?taskId=${nextDeadline.id}`)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.focusButtonText}>Start Focus</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardText}>No upcoming deadlines 🎉</Text>
            </View>
          )}

          {/* ── Stats Row ── */}
          <View style={styles.statsRow}>
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => router.push('/(tabs)/tasks')}
              activeOpacity={0.8}
            >
              <Text style={styles.statValue}>{todayTaskCount}</Text>
              <Text style={styles.statLabel}>Tasks due</Text>
            </TouchableOpacity>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatFocusTime(todayFocusSec)}</Text>
              <Text style={styles.statLabel}>Focused today</Text>
            </View>
          </View>

          {/* ── Upcoming Tasks ── */}
          {upcomingTasks.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Upcoming Tasks</Text>
              {upcomingTasks.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  style={styles.taskRow}
                  onPress={() => router.push(`/modals/task-detail?id=${task.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.taskDot} />
                  <View style={styles.taskInfo}>
                    <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                    {task.courseId ? (
                      <Text style={styles.taskCourse}>{task.courseId}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.taskDue}>
                    {task.dueAt.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  content: { paddingBottom: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 16,
  },
  dateText: { fontSize: 13, color: '#636366', marginBottom: 4 },
  greetText: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  bellButton: { marginTop: 4 },
  bellIcon: { fontSize: 22 },
  deadlineCard: {
    marginHorizontal: 20,
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  deadlineTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  deadlineLabel: { fontSize: 12, color: '#636366', marginBottom: 4 },
  deadlineTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', maxWidth: 200 },
  deadlineCourse: { fontSize: 13, color: '#FF9500', marginTop: 4 },
  deadlineBadge: {
    backgroundColor: '#FF3B3022',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  deadlineBadgeText: { color: '#FF3B30', fontSize: 12, fontWeight: '600' },
  deadlineActions: { flexDirection: 'row', gap: 10 },
  viewButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  viewButtonText: { color: '#000000', fontSize: 14, fontWeight: '700' },
  focusButton: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  focusButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  emptyCard: {
    marginHorizontal: 20,
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyCardText: { color: '#8E8E93', fontSize: 15 },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
  },
  statValue: { fontSize: 26, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#636366' },
  section: { paddingHorizontal: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', marginBottom: 12 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    gap: 12,
  },
  taskDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30' },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
  taskCourse: { fontSize: 12, color: '#FF9500', marginTop: 2 },
  taskDue: { fontSize: 12, color: '#636366' },
});
