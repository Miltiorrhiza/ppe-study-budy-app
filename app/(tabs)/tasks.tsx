import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getTasks, groupTasks, markComplete } from '../../src/services/task.service';
import { getCourses } from '../../src/services/course.service';
import { useAuthStore } from '../../src/stores/auth.store';
import type { Task, TaskFilterType } from '../../src/types';

const FILTER_TABS: { key: TaskFilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Done' },
];

function formatDueDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow';

  return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

interface TaskRowProps {
  task: Task;
  courseName?: string;
  onToggle: (id: string) => void;
  onPress: (id: string) => void;
}

function TaskRow({ task, courseName, onToggle, onPress }: TaskRowProps) {
  return (
    <TouchableOpacity
      style={[styles.taskRow, task.completed && styles.taskRowCompleted]}
      onPress={() => onPress(task.id)}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        style={[styles.checkbox, task.completed && styles.checkboxChecked]}
        onPress={() => onToggle(task.id)}
        hitSlop={8}
      >
        {task.completed ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
      </TouchableOpacity>

      <View style={styles.taskContent}>
        <Text
          style={[styles.taskTitle, task.completed && styles.taskTitleCompleted]}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        <View style={styles.taskMeta}>
          {courseName ? (
            <Text style={styles.taskCourse} numberOfLines={1}>
              {courseName}
            </Text>
          ) : null}
          <Text style={styles.taskDue}>{formatDueDate(task.dueAt)}</Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color="#3A3A3C" />
    </TouchableOpacity>
  );
}

interface SectionHeaderProps {
  title: string;
  color?: string;
}

function SectionHeader({ title, color }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      {color ? <View style={[styles.sectionDot, { backgroundColor: color }]} /> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export default function TasksScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id ?? '');

  const [activeFilter, setActiveFilter] = useState<TaskFilterType>('all');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [courseMap, setCourseMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadCourses = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getCourses(userId);
      const map = data.reduce<Record<string, string>>((acc, course) => {
        acc[course.id] = course.name;
        return acc;
      }, {});
      setCourseMap(map);
    } catch (err) {
      console.warn('[TasksScreen] loadCourses error:', err);
    }
  }, [userId]);

  const loadTasks = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await getTasks(userId, { type: activeFilter });
      setTasks(data);
    } catch (err) {
      console.warn('[TasksScreen] loadTasks error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, activeFilter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  async function handleToggle(id: string) {
    try {
      await markComplete(id);
      await loadTasks();
    } catch (err) {
      console.warn('[TasksScreen] markComplete error:', err);
    }
  }

  function handlePress(id: string) {
    router.push(`/modals/task-detail?id=${id}`);
  }

  const filteredTasks = searchQuery.trim()
    ? tasks.filter((t) => {
        const term = searchQuery.toLowerCase();
        const courseName = t.courseId ? courseMap[t.courseId]?.toLowerCase() ?? '' : '';
        return t.title.toLowerCase().includes(term) || courseName.includes(term);
      })
    : tasks;

  const grouped = groupTasks(filteredTasks);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tasks</Text>
        <TouchableOpacity
          onPress={() => {
            setSearchVisible((v) => !v);
            if (searchVisible) setSearchQuery('');
          }}
          hitSlop={8}
          style={styles.searchButton}
        >
          <Ionicons name="search" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      {searchVisible ? (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search tasks..."
            placeholderTextColor="#636366"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            returnKeyType="search"
          />
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContent}
      >
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeFilter === tab.key && styles.tabActive]}
            onPress={() => setActiveFilter(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeFilter === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FF3B30" />
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {grouped.urgent.length > 0 ? (
            <>
              <SectionHeader title="URGENT" color="#FF3B30" />
              {grouped.urgent.map((task) => (
                <View key={task.id} style={styles.urgentBorder}>
                  <TaskRow
                    task={task}
                    courseName={task.courseId ? courseMap[task.courseId] : undefined}
                    onToggle={handleToggle}
                    onPress={handlePress}
                  />
                </View>
              ))}
            </>
          ) : null}

          {grouped.thisWeek.length > 0 ? (
            <>
              <SectionHeader title="THIS WEEK" />
              {grouped.thisWeek.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  courseName={task.courseId ? courseMap[task.courseId] : undefined}
                  onToggle={handleToggle}
                  onPress={handlePress}
                />
              ))}
            </>
          ) : null}

          {grouped.completed.length > 0 ? (
            <>
              <SectionHeader title="COMPLETED" />
              {grouped.completed.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  courseName={task.courseId ? courseMap[task.courseId] : undefined}
                  onToggle={handleToggle}
                  onPress={handlePress}
                />
              ))}
            </>
          ) : null}

          {grouped.urgent.length === 0 &&
          grouped.thisWeek.length === 0 &&
          grouped.completed.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No tasks found</Text>
              <Text style={styles.emptySubtext}>Tap + to add a new task</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  tabsScroll: {
    flexGrow: 0,
  },
  tabsContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  tabActive: {
    backgroundColor: '#FF3B30',
    borderColor: '#FF3B30',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8E8E93',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#636366',
    letterSpacing: 0.8,
  },
  urgentBorder: {
    borderLeftWidth: 3,
    borderLeftColor: '#FF3B30',
    borderRadius: 2,
    marginBottom: 1,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
    gap: 12,
  },
  taskRowCompleted: {
    opacity: 0.5,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#3A3A3C',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  checkboxChecked: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#636366',
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskCourse: {
    fontSize: 12,
    color: '#FF9500',
    fontWeight: '500',
  },
  taskDue: {
    fontSize: 12,
    color: '#636366',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#636366',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#3A3A3C',
  },
});
