import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  autoSaveDraft,
  createNote,
  deleteNote,
  getNoteById,
  updateNote,
} from '../../src/services/note.service';
import { getCourses } from '../../src/services/course.service';
import { useAuthStore } from '../../src/stores/auth.store';
import type { Course, Note } from '../../src/types';

export default function NoteEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const userId = useAuthStore((s) => s.user?.id ?? '');

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoadingCourses(true);
    getCourses(userId)
      .then((data) => setCourses(data))
      .catch((err) => console.warn('[NoteEditor] loadCourses error:', err))
      .finally(() => setLoadingCourses(false));
  }, [userId]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getNoteById(id)
      .then((found) => {
        setNote(found);
        setTitle(found.title ?? '');
        setContent(found.content ?? '');
        setSelectedCourseId(found.courseId ?? null);
      })
      .catch((err) => {
        console.warn('[NoteEditor] load error:', err);
      })
      .finally(() => setLoading(false));
  }, [id, userId]);

  useEffect(() => {
    if (id) {
      autoSaveDraft(id, content);
    }
  }, [id, content]);

  async function handleSave() {
    setSaving(true);
    try {
      if (id) {
        const updated = await updateNote(id, { title, content, courseId: selectedCourseId });
        setNote(updated);
      } else {
        const created = await createNote(
          { title, content, courseId: selectedCourseId },
          userId
        );
        router.replace(`/modals/note-editor?id=${created.id}`);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    Alert.alert('Delete note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNote(id);
            router.back();
          } catch {
            Alert.alert('Error', 'Failed to delete note.');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#FF3B30" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navButton} hitSlop={8}>
          <Ionicons name="close" size={20} color="#8E8E93" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Note</Text>
        <View style={styles.navActions}>
          {id ? (
            <TouchableOpacity onPress={handleDelete} style={styles.navButton} hitSlop={8}>
              <Ionicons name="trash" size={18} color="#FF3B30" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={handleSave} style={styles.navButton} hitSlop={8}>
            {saving ? (
              <ActivityIndicator color="#FF3B30" size="small" />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        <TextInput
          style={styles.titleInput}
          placeholder="Note title"
          placeholderTextColor="#636366"
          value={title}
          onChangeText={setTitle}
        />
        <View style={styles.courseBlock}>
          <Text style={styles.courseLabel}>Course</Text>
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
        <TextInput
          style={styles.contentInput}
          placeholder="Start writing..."
          placeholderTextColor="#636366"
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
        />
        {note ? (
          <Text style={styles.meta}>
            Last edited {note.updatedAt.toLocaleString('en-AU')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
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
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  body: {
    flex: 1,
    padding: 20,
  },
  titleInput: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  courseBlock: {
    marginBottom: 12,
  },
  courseLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
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
  contentInput: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  meta: {
    marginTop: 8,
    fontSize: 12,
    color: '#8E8E93',
  },
});
