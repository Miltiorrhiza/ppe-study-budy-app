import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  createTask,
  getTaskById,
  updateTask,
  validateTaskTitle,
  validateDueDate,
} from '../../src/services/task.service';
import { getCourses } from '../../src/services/course.service';
import { useAuthStore } from '../../src/stores/auth.store';
import type { Course, Priority, Task } from '../../src/types';

const REMINDER_OPTIONS = [
  { label: '1 day before', offsetMs: 24 * 60 * 60 * 1000 },
  { label: '3 hours before', offsetMs: 3 * 60 * 60 * 1000 },
  { label: '1 hour before', offsetMs: 60 * 60 * 1000 },
];

const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

function parseDueDate(dateStr: string, timeStr: string): Date | null {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const timeRegex = /^\d{2}:\d{2}$/;
  if (!dateRegex.test(dateStr)) return null;
  const timeValue = timeRegex.test(timeStr) ? timeStr : '23:59';
  const d = new Date(`${dateStr}T${timeValue}:00`);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-CA');
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function remindersToOffsets(task: Task): number[] {
  const dueMs = task.dueAt.getTime();
  return task.reminders
    .map((r) => Math.round((dueMs - r.remindAt.getTime()) / 60000) * 60000)
    .map((offset) => (offset > 0 ? offset : 0))
    .filter((offset) => REMINDER_OPTIONS.some((opt) => Math.abs(opt.offsetMs - offset) < 60000));
}

interface FormErrors {
  title?: string;
  dueDate?: string;
  general?: string;
}

export default function AddTaskScreen() {
  const router = useRouter();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const userId = useAuthStore((s) => s.user?.id ?? '');

  const [title, setTitle] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<Priority>('high');
  const [selectedReminders, setSelectedReminders] = useState<number[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoadingCourses(true);
    getCourses(userId)
      .then((data) => setCourses(data))
      .catch((err) => console.warn('[AddTask] loadCourses error:', err))
      .finally(() => setLoadingCourses(false));
  }, [userId]);

  useEffect(() => {
    if (!editId) return;
    setLoadingExisting(true);
    getTaskById(editId)
      .then((task) => {
        setTitle(task.title);
        setSelectedCourseId(task.courseId ?? null);
        setPriority(task.priority);
        setDueDate(formatDate(task.dueAt));
        setDueTime(formatTime(task.dueAt));
        setSelectedReminders(remindersToOffsets(task));
      })
      .catch((err) => {
        console.warn('[AddTask] Failed to load task for edit:', err);
      })
      .finally(() => setLoadingExisting(false));
  }, [editId]);

  function toggleReminder(offsetMs: number) {
    setSelectedReminders((prev) =>
      prev.includes(offsetMs) ? prev.filter((r) => r !== offsetMs) : [...prev, offsetMs]
    );
  }

  async function handleSave() {
    const newErrors: FormErrors = {};

    if (!validateTaskTitle(title)) {
      newErrors.title = 'Task title is required.';
    }

    let parsedDue: Date | null = null;
    if (dueDate.trim()) {
      parsedDue = parseDueDate(dueDate.trim(), dueTime.trim());
      if (!parsedDue) {
        newErrors.dueDate = 'Invalid date format. Use YYYY-MM-DD.';
      } else if (!validateDueDate(parsedDue)) {
        newErrors.dueDate = 'Due date cannot be earlier than today.';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    const effectiveDue =
      parsedDue ??
      (() => {
        const d = new Date();
        d.setHours(23, 59, 0, 0);
        return d;
      })();

    const reminderTimes = selectedReminders.map(
      (offsetMs) => new Date(effectiveDue.getTime() - offsetMs)
    );

    setLoading(true);
    try {
      if (editId) {
        await updateTask(editId, {
          title: title.trim(),
          courseId: selectedCourseId ?? null,
          dueAt: effectiveDue,
          priority,
          reminderTimes,
        });
      } else {
        await createTask(
          {
            title: title.trim(),
            courseId: selectedCourseId ?? null,
            dueAt: effectiveDue,
            priority,
            reminderTimes,
          },
          userId
        );
      }
      router.back();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save task.';
      setErrors({ general: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navButton} hitSlop={8}>
          <Ionicons name="close" size={20} color="#8E8E93" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{editId ? 'Edit Task' : 'New Task'}</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={styles.navButton}
          disabled={loading}
          hitSlop={8}
        >
          {loading ? (
            <ActivityIndicator color="#FF3B30" size="small" />
          ) : (
            <Text style={[styles.navButtonText, styles.saveText]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {loadingExisting ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FF3B30" />
        </View>
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {errors.general ? (
            <View style={styles.generalError}>
              <Text style={styles.generalErrorText}>{errors.general}</Text>
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Task Title *</Text>
            <TextInput
              style={[styles.input, errors.title ? styles.inputError : null]}
              placeholder="e.g. Assignment 1"
              placeholderTextColor="#636366"
              value={title}
              onChangeText={setTitle}
              autoCapitalize="sentences"
            />
            {errors.title ? <Text style={styles.errorText}>{errors.title}</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Course</Text>
            {loadingCourses ? (
              <ActivityIndicator color="#FF3B30" />
            ) : courses.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.courseRow}
              >
                <TouchableOpacity
                  style={[
                    styles.courseChip,
                    selectedCourseId === null && styles.courseChipActive,
                  ]}
                  onPress={() => setSelectedCourseId(null)}
                >
                  <Text
                    style={[
                      styles.courseChipText,
                      selectedCourseId === null && styles.courseChipTextActive,
                    ]}
                  >
                    No course
                  </Text>
                </TouchableOpacity>
                {courses.map((course) => {
                  const active = selectedCourseId === course.id;
                  return (
                    <TouchableOpacity
                      key={course.id}
                      style={[styles.courseChip, active && styles.courseChipActive]}
                      onPress={() => setSelectedCourseId(course.id)}
                    >
                      <Text style={[styles.courseChipText, active && styles.courseChipTextActive]}>
                        {course.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.emptyCourseRow}>
                <Text style={styles.helperText}>No courses yet.</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
                  <Text style={styles.helperLink}>Add courses</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Due Date</Text>
            <TextInput
              style={[styles.input, errors.dueDate ? styles.inputError : null]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#636366"
              value={dueDate}
              onChangeText={setDueDate}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
            {errors.dueDate ? <Text style={styles.errorText}>{errors.dueDate}</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Due Time</Text>
            <TextInput
              style={styles.input}
              placeholder="HH:MM"
              placeholderTextColor="#636366"
              value={dueTime}
              onChangeText={setDueTime}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Priority</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.priorityButton,
                    priority === p && styles.priorityButtonActive,
                    priority === p && p === 'high' && styles.priorityHigh,
                    priority === p && p === 'medium' && styles.priorityMedium,
                    priority === p && p === 'low' && styles.priorityLow,
                  ]}
                  onPress={() => setPriority(p)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.priorityButtonText,
                      priority === p && styles.priorityButtonTextActive,
                    ]}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Reminders</Text>
            {REMINDER_OPTIONS.map((opt) => {
              const checked = selectedReminders.includes(opt.offsetMs);
              return (
                <TouchableOpacity
                  key={opt.offsetMs}
                  style={styles.checkboxRow}
                  onPress={() => toggleReminder(opt.offsetMs)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked ? (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    ) : null}
                  </View>
                  <Text style={styles.checkboxLabel}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3C',
    backgroundColor: '#000000',
  },
  navButton: {
    minWidth: 48,
    alignItems: 'center',
  },
  navButtonText: {
    fontSize: 17,
    color: '#8E8E93',
    fontWeight: '400',
  },
  saveText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 48,
  },
  generalError: {
    backgroundColor: '#2C1010',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  generalErrorText: {
    color: '#FF3B30',
    fontSize: 14,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#EBEBF5',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  courseChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  courseChipActive: {
    backgroundColor: '#FF3B30',
    borderColor: '#FF3B30',
  },
  courseChipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  courseChipTextActive: {
    color: '#FFFFFF',
  },
  emptyCourseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  helperText: {
    color: '#8E8E93',
    fontSize: 13,
  },
  helperLink: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: '600',
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 13,
    marginTop: 6,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  priorityButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  priorityButtonActive: {
    borderWidth: 0,
  },
  priorityHigh: {
    backgroundColor: '#3A1010',
    borderColor: '#FF3B30',
    borderWidth: 1,
  },
  priorityMedium: {
    backgroundColor: '#3A2A00',
    borderColor: '#FF9500',
    borderWidth: 1,
  },
  priorityLow: {
    backgroundColor: '#0A2A0A',
    borderColor: '#34C759',
    borderWidth: 1,
  },
  priorityButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8E8E93',
  },
  priorityButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#3A3A3C',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },
  checkboxChecked: {
    backgroundColor: '#FF3B30',
    borderColor: '#FF3B30',
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#EBEBF5',
  },
});
