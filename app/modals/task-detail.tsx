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
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { getTaskById, deleteTask, getDaysUntilDue } from '../../src/services/task.service';
import { getCourseById } from '../../src/services/course.service';
import { supabase } from '../../src/lib/supabase';
import type { Task, TaskAttachment } from '../../src/types';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function formatDateTime(date: Date): string {
  return date.toLocaleDateString('en-AU', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRemindAt(date: Date): string {
  return date.toLocaleDateString('en-AU', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function priorityColor(priority: string): string {
  switch (priority) {
    case 'high':
      return '#FF3B30';
    case 'medium':
      return '#FF9500';
    case 'low':
      return '#34C759';
    default:
      return '#636366';
  }
}

function daysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SectionBlock({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={16} color="#8E8E93" />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export default function TaskDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [task, setTask] = useState<Task | null>(null);
  const [courseName, setCourseName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadTask = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getTaskById(id);
      setTask(data);
      if (data.courseId) {
        try {
          const course = await getCourseById(data.courseId);
          setCourseName(course?.name ?? null);
        } catch (err) {
          console.warn('[TaskDetail] course lookup error:', err);
          setCourseName(null);
        }
      } else {
        setCourseName(null);
      }
    } catch (err) {
      console.warn('[TaskDetail] loadTask error:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  function handleMenuLongPress() {
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            try {
              await deleteTask(id);
              router.back();
            } catch {
              Alert.alert('Error', 'Failed to delete task. Please try again.');
            }
          },
        },
      ]
    );
  }

  async function handleUploadAttachment() {
    if (!task) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];

      if (asset.size && asset.size > MAX_FILE_SIZE) {
        Alert.alert('File Too Large', 'File size cannot exceed 20 MB.');
        return;
      }

      const mimeType = asset.mimeType ?? '';
      if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
        Alert.alert('Unsupported Format', 'Only PDF and image files are supported.');
        return;
      }

      setUploading(true);

      const fileName = asset.name ?? `attachment_${Date.now()}`;
      const storagePath = `task-attachments/${task.userId}/${task.id}/${fileName}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(storagePath, blob, { contentType: mimeType, upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(storagePath);

      const { error: dbError } = await supabase.from('task_attachments').insert({
        task_id: task.id,
        file_name: fileName,
        file_url: urlData.publicUrl,
        file_size: asset.size ?? blob.size,
        mime_type: mimeType,
      });

      if (dbError) throw dbError;

      await loadTask();
    } catch (err) {
      Alert.alert('Upload Failed', 'Failed to upload attachment. Please try again.');
      console.warn('[TaskDetail] upload error:', err);
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#FF3B30" />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Task not found.</Text>
      </View>
    );
  }

  const daysLeft = getDaysUntilDue(task.dueAt);
  const pColor = priorityColor(task.priority);

  return (
    <View style={styles.container}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navButton} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.navSpacer} />
        <TouchableOpacity
          onPress={() => {}}
          onLongPress={handleMenuLongPress}
          style={styles.navButton}
          hitSlop={8}
          delayLongPress={400}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.priorityBadge, { backgroundColor: pColor + '22', borderColor: pColor }]}>
          <Text style={[styles.priorityBadgeText, { color: pColor }]}>{daysLabel(daysLeft)}</Text>
        </View>

        <Text style={styles.taskTitle}>{task.title}</Text>
        {courseName ? <Text style={styles.courseName}>{courseName}</Text> : null}

        <SectionBlock icon="calendar" title="DUE DATE">
          <Text style={styles.bodyText}>{formatDateTime(task.dueAt)}</Text>
        </SectionBlock>

        <SectionBlock icon="notifications" title="REMINDERS">
          {task.reminders.length > 0 ? (
            task.reminders.map((r) => (
              <Text key={r.id} style={styles.bodyText}>
                {formatRemindAt(r.remindAt)}
              </Text>
            ))
          ) : (
            <Text style={styles.emptyBodyText}>No reminders set</Text>
          )}
        </SectionBlock>

        <SectionBlock icon="document-text" title="DESCRIPTION">
          {task.description ? (
            <Text style={styles.bodyText}>{task.description}</Text>
          ) : (
            <Text style={styles.emptyBodyText}>No description</Text>
          )}
        </SectionBlock>

        <SectionBlock icon="attach" title="ATTACHMENTS">
          {task.attachments.map((att: TaskAttachment) => (
            <View key={att.id} style={styles.attachmentRow}>
              <Ionicons
                name={att.mimeType === 'application/pdf' ? 'document-text' : 'image'}
                size={20}
                color="#8E8E93"
              />
              <View style={styles.attachmentInfo}>
                <Text style={styles.attachmentName} numberOfLines={1}>
                  {att.fileName}
                </Text>
                <Text style={styles.attachmentSize}>{fileSizeLabel(att.fileSize)}</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={handleUploadAttachment}
            disabled={uploading}
            activeOpacity={0.7}
          >
            {uploading ? (
              <ActivityIndicator color="#FF3B30" size="small" />
            ) : (
              <Text style={styles.uploadButtonText}>+ Add Attachment</Text>
            )}
          </TouchableOpacity>
        </SectionBlock>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.focusButton}
          onPress={() => router.push(`/modals/focus-timer?taskId=${task.id}`)}
          activeOpacity={0.85}
        >
          <Text style={styles.focusButtonText}>Start Focus Session</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => router.push(`/modals/add-task?editId=${task.id}`)}
          activeOpacity={0.85}
        >
          <Text style={styles.editButtonText}>Edit Task</Text>
        </TouchableOpacity>
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
  errorText: {
    color: '#636366',
    fontSize: 16,
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
  },
  navButton: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navSpacer: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  priorityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  priorityBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  taskTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    lineHeight: 32,
  },
  courseName: {
    fontSize: 15,
    color: '#FF9500',
    fontWeight: '500',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#636366',
    letterSpacing: 0.8,
  },
  sectionBody: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  bodyText: {
    fontSize: 15,
    color: '#EBEBF5',
    lineHeight: 22,
  },
  emptyBodyText: {
    fontSize: 14,
    color: '#636366',
    fontStyle: 'italic',
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  attachmentInfo: {
    flex: 1,
  },
  attachmentName: {
    fontSize: 14,
    color: '#EBEBF5',
    fontWeight: '500',
  },
  attachmentSize: {
    fontSize: 12,
    color: '#636366',
    marginTop: 2,
  },
  uploadButton: {
    marginTop: 4,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '500',
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: 16,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2C2C2E',
    backgroundColor: '#000000',
  },
  focusButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  focusButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  editButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#3A3A3C',
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
