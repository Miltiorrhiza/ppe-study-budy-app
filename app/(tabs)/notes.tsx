import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { getNotes, searchNotes } from '../../src/services/note.service';
import { getCourses } from '../../src/services/course.service';
import { useAuthStore } from '../../src/stores/auth.store';
import type { Course, Note } from '../../src/types';

function NoteRow({
  note,
  courseName,
  onPress,
}: {
  note: Note;
  courseName?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.noteRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.noteInfo}>
        <Text style={styles.noteTitle} numberOfLines={1}>
          {note.title || 'Untitled Note'}
        </Text>
        {courseName ? <Text style={styles.noteCourse}>{courseName}</Text> : null}
        <Text style={styles.noteSnippet} numberOfLines={2}>
          {note.content || 'No content yet'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#3A3A3C" />
    </TouchableOpacity>
  );
}

export default function NotesScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id ?? '');

  const [notes, setNotes] = useState<Note[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const courseMap = useMemo(
    () =>
      courses.reduce<Record<string, string>>((acc, course) => {
        acc[course.id] = course.name;
        return acc;
      }, {}),
    [courses]
  );

  const loadCourses = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getCourses(userId);
      setCourses(data);
    } catch (err) {
      console.warn('[NotesScreen] loadCourses error:', err);
    }
  }, [userId]);

  const loadNotes = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const trimmed = query.trim();
      let data = trimmed ? await searchNotes(userId, trimmed) : await getNotes(userId);
      if (selectedCourseId) {
        data = data.filter((note) => note.courseId === selectedCourseId);
      }
      setNotes(data);
    } catch (err) {
      console.warn('[NotesScreen] loadNotes error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, query, selectedCourseId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notes</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#8E8E93" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search notes..."
          placeholderTextColor="#636366"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity
          style={[styles.filterChip, selectedCourseId === null && styles.filterChipActive]}
          onPress={() => setSelectedCourseId(null)}
        >
          <Text
            style={[
              styles.filterChipText,
              selectedCourseId === null && styles.filterChipTextActive,
            ]}
          >
            All courses
          </Text>
        </TouchableOpacity>
        {courses.map((course) => {
          const active = selectedCourseId === course.id;
          return (
            <TouchableOpacity
              key={course.id}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setSelectedCourseId(course.id)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {course.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FF3B30" />
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {notes.length > 0 ? (
            notes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                courseName={note.courseId ? courseMap[note.courseId] : undefined}
                onPress={() => router.push(`/modals/note-editor?id=${note.id}`)}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No notes yet</Text>
              <Text style={styles.emptySubtext}>Create your first note</Text>
            </View>
          )}
        </ScrollView>
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/modals/note-editor')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  filterRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 10,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  filterChipActive: {
    backgroundColor: '#FF3B30',
    borderColor: '#FF3B30',
  },
  filterChipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  noteInfo: {
    flex: 1,
    marginRight: 12,
  },
  noteTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  noteCourse: {
    fontSize: 12,
    color: '#FF9500',
    fontWeight: '600',
    marginBottom: 4,
  },
  noteSnippet: {
    fontSize: 13,
    color: '#8E8E93',
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: Platform.OS === 'ios' ? 30 : 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
