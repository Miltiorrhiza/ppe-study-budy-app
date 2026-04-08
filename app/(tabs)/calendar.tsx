import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getTasks } from '../../src/services/task.service';
import { useAuthStore } from '../../src/stores/auth.store';
import type { Task } from '../../src/types';

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getMonthMeta(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { year, month, firstDay, daysInMonth };
}

function buildGrid(date: Date): Array<number | null> {
  const { firstDay, daysInMonth } = getMonthMeta(date);
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length < 42) cells.push(null);
  return cells;
}

export default function CalendarScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await getTasks(userId, { type: 'all' });
      setTasks(data);
    } catch (err) {
      console.warn('[Calendar] loadTasks error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((task) => {
      const key = dateKey(task.dueAt);
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    });
    return map;
  }, [tasks]);

  const grid = useMemo(() => buildGrid(currentMonth), [currentMonth]);

  const selectedKey = dateKey(selectedDate);
  const selectedTasks = tasksByDate.get(selectedKey) ?? [];

  function shiftMonth(delta: number) {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
    setCurrentMonth(newDate);
  }

  const monthLabel = currentMonth.toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
      </View>

      <View style={styles.monthBar}>
        <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthButton}>
          <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthButton}>
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
          <Text key={d} style={styles.weekLabel}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((day, idx) => {
          if (!day) {
            return <View key={`empty-${idx}`} style={styles.cell} />;
          }
          const cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
          const key = dateKey(cellDate);
          const hasTasks = tasksByDate.has(key);
          const isToday = dateKey(new Date()) === key;
          const isSelected = selectedKey === key;

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.cell,
                isSelected && styles.cellSelected,
                isToday && styles.cellToday,
              ]}
              onPress={() => setSelectedDate(cellDate)}
            >
              <Text style={[styles.cellText, isSelected && styles.cellTextSelected]}>
                {day}
              </Text>
              {hasTasks ? <View style={styles.taskDot} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {selectedDate.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
        </Text>
        {loading ? (
          <ActivityIndicator color="#FF3B30" />
        ) : (
          <ScrollView style={styles.taskList} contentContainerStyle={styles.taskListContent}>
            {selectedTasks.length > 0 ? (
              selectedTasks.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  style={styles.taskRow}
                  onPress={() => router.push(`/modals/task-detail?id=${task.id}`)}
                >
                  <View style={styles.taskInfo}>
                    <Text style={styles.taskTitle} numberOfLines={1}>
                      {task.title}
                    </Text>
                    <Text style={styles.taskMeta}>{task.courseId ?? 'No course'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#3A3A3C" />
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.emptyText}>No tasks for this date</Text>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  monthButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  weekLabel: {
    width: 32,
    textAlign: 'center',
    color: '#8E8E93',
    fontSize: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    rowGap: 10,
  },
  cell: {
    width: '14.28%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  cellText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  cellSelected: {
    backgroundColor: '#FF3B30',
    borderRadius: 16,
  },
  cellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  cellToday: {
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 16,
  },
  taskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    marginTop: 4,
  },
  section: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  taskList: {
    flex: 1,
  },
  taskListContent: {
    paddingBottom: 20,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  taskInfo: {
    flex: 1,
    marginRight: 12,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  taskMeta: {
    fontSize: 12,
    color: '#8E8E93',
  },
  emptyText: {
    color: '#8E8E93',
  },
});
