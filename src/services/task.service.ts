import NetInfo from '@react-native-community/netinfo';
import { MMKV } from 'react-native-mmkv';
import { supabase } from '../lib/supabase';
import type { Task, TaskReminder, TaskAttachment, CreateTaskInput, TaskFilter } from '../types';
import { scheduleReminder, cancelReminder } from './notification.service';
import { enqueue, registerSyncHandler } from '../lib/offline-queue';

const taskCache = new MMKV({ id: 'task-cache' });
const TASK_CACHE_KEY = 'tasks';
const idMapStorage = new MMKV({ id: 'task-id-map' });
const ID_MAP_KEY = 'task_id_map';

function readCache(): Task[] {
  const raw = taskCache.getString(TASK_CACHE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Task[];
    return parsed.map((t) => ({
      ...t,
      dueAt: new Date(t.dueAt),
      completedAt: t.completedAt ? new Date(t.completedAt) : null,
      reminders: (t.reminders ?? []).map((r) => ({
        ...r,
        remindAt: new Date(r.remindAt),
      })),
      attachments: (t.attachments ?? []).map((a) => ({
        ...a,
        createdAt: new Date(a.createdAt),
      })),
      createdAt: new Date(t.createdAt),
      updatedAt: new Date(t.updatedAt),
    }));
  } catch {
    return [];
  }
}

function writeCache(tasks: Task[]): void {
  taskCache.set(TASK_CACHE_KEY, JSON.stringify(tasks));
}

function readIdMap(): Record<string, string> {
  const raw = idMapStorage.getString(ID_MAP_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeIdMap(map: Record<string, string>): void {
  idMapStorage.set(ID_MAP_KEY, JSON.stringify(map));
}

function resolveTaskId(id: string): string {
  if (!id.startsWith('local-')) return id;
  const map = readIdMap();
  return map[id] ?? id;
}

export function validateTaskTitle(title: string): boolean {
  return title.trim().length > 0;
}

export function validateDueDate(dueAt: Date, now: Date = new Date()): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
  return due >= today;
}

export function getDaysUntilDue(dueAt: Date, now: Date = new Date()): number {
  return Math.ceil((dueAt.getTime() - now.getTime()) / 86400000);
}

export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  switch (filter.type) {
    case 'all':
      return tasks;
    case 'today':
      return tasks.filter((t) => !t.completed && t.dueAt >= todayStart && t.dueAt < todayEnd);
    case 'upcoming':
      return tasks.filter((t) => !t.completed && t.dueAt >= todayEnd);
    case 'completed':
      return tasks.filter((t) => t.completed);
    default:
      return tasks;
  }
}

export function groupTasks(
  tasks: Task[],
  now: Date = new Date()
): { urgent: Task[]; thisWeek: Task[]; completed: Task[] } {
  const urgent: Task[] = [];
  const thisWeek: Task[] = [];
  const completed: Task[] = [];

  for (const task of tasks) {
    if (task.completed) {
      completed.push(task);
    } else {
      const days = getDaysUntilDue(task.dueAt, now);
      if (days <= 2) {
        urgent.push(task);
      } else {
        thisWeek.push(task);
      }
    }
  }

  return { urgent, thisWeek, completed };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Task {
  return {
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id ?? null,
    title: row.title,
    description: row.description ?? null,
    dueAt: new Date(row.due_at),
    priority: row.priority,
    completed: row.completed,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    reminders: (row.task_reminders ?? []).map(mapReminder),
    attachments: (row.task_attachments ?? []).map(mapAttachment),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReminder(row: any): TaskReminder {
  return {
    id: row.id,
    taskId: row.task_id,
    remindAt: new Date(row.remind_at),
    notificationId: row.notification_id ?? null,
    sent: row.sent,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAttachment(row: any): TaskAttachment {
  return {
    id: row.id,
    taskId: row.task_id,
    fileName: row.file_name,
    fileUrl: row.file_url,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    createdAt: new Date(row.created_at),
  };
}

function upsertCachedTask(task: Task): void {
  const cached = readCache();
  const idx = cached.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    cached[idx] = task;
  } else {
    cached.push(task);
  }
  writeCache(cached);
}

function removeCachedTask(id: string): void {
  const cached = readCache().filter((t) => t.id !== id);
  writeCache(cached);
}

export async function createTask(input: CreateTaskInput, userId: string): Promise<Task> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    const localId = `local-${Date.now()}`;
    const localTask: Task = {
      id: localId,
      userId,
      courseId: input.courseId ?? null,
      title: input.title,
      description: input.description ?? null,
      dueAt: input.dueAt,
      priority: input.priority ?? 'high',
      completed: false,
      completedAt: null,
      reminders: [],
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    upsertCachedTask(localTask);
    enqueue({
      type: 'create',
      resource: 'task',
      payload: { localId, userId, input },
    });
    return localTask;
  }

  const { data: taskRow, error: taskError } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      course_id: input.courseId ?? null,
      title: input.title,
      description: input.description ?? null,
      due_at: input.dueAt.toISOString(),
      priority: input.priority ?? 'high',
      completed: false,
    })
    .select()
    .single();

  if (taskError) throw taskError;

  if (input.reminderTimes && input.reminderTimes.length > 0) {
    const reminders = input.reminderTimes.map((remindAt) => ({
      task_id: taskRow.id,
      remind_at: remindAt.toISOString(),
    }));
    const { data: insertedReminders, error: reminderError } = await supabase
      .from('task_reminders')
      .insert(reminders)
      .select();
    if (reminderError) throw reminderError;

    if (insertedReminders) {
      for (const reminder of insertedReminders) {
        try {
          const notificationId = await scheduleReminder(
            taskRow.id,
            new Date(reminder.remind_at),
            input.title
          );
          if (notificationId) {
            await supabase
              .from('task_reminders')
              .update({ notification_id: notificationId })
              .eq('id', reminder.id);
          }
        } catch (err) {
          console.warn('[TaskService] Failed to schedule reminder notification:', err);
        }
      }
    }
  }

  const task = await getTaskById(taskRow.id);
  upsertCachedTask(task);
  return task;
}

export async function updateTask(
  id: string,
  updates: Partial<Task> & { reminderTimes?: Date[] }
): Promise<Task> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    const cached = readCache();
    const idx = cached.findIndex((t) => t.id === id);
    if (idx >= 0) {
      cached[idx] = {
        ...cached[idx],
        ...updates,
        dueAt: updates.dueAt ?? cached[idx].dueAt,
        updatedAt: new Date(),
      };
      writeCache(cached);
    }
    enqueue({
      type: 'update',
      resource: 'task',
      payload: { id, updates },
    });
    return cached[idx] ?? (await getTaskById(id));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbUpdates: Record<string, any> = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.dueAt !== undefined) dbUpdates.due_at = updates.dueAt.toISOString();
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.completed !== undefined) dbUpdates.completed = updates.completed;
  if (updates.completedAt !== undefined)
    dbUpdates.completed_at = updates.completedAt ? updates.completedAt.toISOString() : null;
  if (updates.courseId !== undefined) dbUpdates.course_id = updates.courseId;
  dbUpdates.updated_at = new Date().toISOString();

  const { error } = await supabase.from('tasks').update(dbUpdates).eq('id', id);
  if (error) throw error;

  if (updates.dueAt !== undefined) {
    try {
      const { data: existingReminders } = await supabase
        .from('task_reminders')
        .select('*')
        .eq('task_id', id);

      for (const reminder of existingReminders ?? []) {
        if (reminder.notification_id) {
          try {
            await cancelReminder(reminder.notification_id);
          } catch (err) {
            console.warn('[TaskService] Failed to cancel reminder notification:', err);
          }
        }
      }

      await supabase.from('task_reminders').delete().eq('task_id', id);

      if (updates.reminderTimes && updates.reminderTimes.length > 0) {
        const taskTitle = updates.title ?? (await getTaskById(id)).title;
        const newReminders = updates.reminderTimes.map((remindAt) => ({
          task_id: id,
          remind_at: remindAt.toISOString(),
        }));
        const { data: insertedReminders, error: reminderError } = await supabase
          .from('task_reminders')
          .insert(newReminders)
          .select();
        if (reminderError) throw reminderError;

        for (const reminder of insertedReminders ?? []) {
          try {
            const notificationId = await scheduleReminder(
              id,
              new Date(reminder.remind_at),
              taskTitle
            );
            if (notificationId) {
              await supabase
                .from('task_reminders')
                .update({ notification_id: notificationId })
                .eq('id', reminder.id);
            }
          } catch (err) {
            console.warn('[TaskService] Failed to schedule reminder notification:', err);
          }
        }
      }
    } catch (err) {
      console.warn('[TaskService] Failed to update reminder notifications:', err);
    }
  }

  const task = await getTaskById(id);
  upsertCachedTask(task);
  return task;
}

export async function deleteTask(id: string): Promise<void> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    removeCachedTask(id);
    enqueue({
      type: 'delete',
      resource: 'task',
      payload: { id },
    });
    return;
  }

  try {
    const { data: reminders } = await supabase
      .from('task_reminders')
      .select('notification_id')
      .eq('task_id', id);

    for (const reminder of reminders ?? []) {
      if (reminder.notification_id) {
        try {
          await cancelReminder(reminder.notification_id);
        } catch (err) {
          console.warn('[TaskService] Failed to cancel reminder notification:', err);
        }
      }
    }
  } catch (err) {
    console.warn('[TaskService] Failed to fetch reminders for cancellation:', err);
  }

  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
  removeCachedTask(id);
}

export async function getTasks(userId: string, filter: TaskFilter): Promise<Task[]> {
  try {
    let query = supabase
      .from('tasks')
      .select('*, task_reminders(*), task_attachments(*)')
      .eq('user_id', userId)
      .order('due_at', { ascending: true });

    if (filter.courseId) {
      query = query.eq('course_id', filter.courseId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const tasks: Task[] = (data ?? []).map(mapRow);
    const cached = readCache();
    const idMap = readIdMap();
    const localTasks = cached.filter((t) => t.id.startsWith('local-') && !idMap[t.id]);
    const merged = [...tasks, ...localTasks];
    writeCache(merged);
    return filterTasks(merged, filter);
  } catch (err) {
    console.warn('[TaskService] getTasks fallback to cache:', err);
    const cached = readCache();
    return filterTasks(cached, filter);
  }
}

export async function getTaskById(id: string): Promise<Task> {
  const resolvedId = resolveTaskId(id);
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, task_reminders(*), task_attachments(*)')
      .eq('id', resolvedId)
      .single();

    if (error) throw error;
    const task = mapRow(data);
    upsertCachedTask(task);
    return task;
  } catch (err) {
    const cached = readCache().find((t) => t.id === id || t.id === resolvedId);
    if (cached) return cached;
    throw err;
  }
}

export async function markComplete(id: string): Promise<Task> {
  const now = new Date();
  return updateTask(id, {
    completed: true,
    completedAt: now,
  });
}

export async function searchTasks(userId: string, query: string): Promise<Task[]> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, task_reminders(*), task_attachments(*), courses(name)')
      .eq('user_id', userId)
      .order('due_at', { ascending: true });

    if (error) throw error;

    const lowerQuery = query.toLowerCase();
    return (data ?? [])
      .filter((row) => {
        const titleMatch = row.title?.toLowerCase().includes(lowerQuery);
        const courseMatch = row.courses?.name?.toLowerCase().includes(lowerQuery);
        return titleMatch || courseMatch;
      })
      .map(mapRow);
  } catch (err) {
    console.warn('[TaskService] searchTasks fallback to cache:', err);
    const lowerQuery = query.toLowerCase();
    return readCache().filter(
      (t) =>
        t.title.toLowerCase().includes(lowerQuery) ||
        (t.courseId ?? '').toLowerCase().includes(lowerQuery)
    );
  }
}

registerSyncHandler('task', async (operation) => {
  if (operation.type === 'create') {
    const { localId, userId, input } = operation.payload as {
      localId: string;
      userId: string;
      input: CreateTaskInput;
    };

    const { data: taskRow, error: taskError } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        course_id: input.courseId ?? null,
        title: input.title,
        description: input.description ?? null,
        due_at: input.dueAt.toISOString(),
        priority: input.priority ?? 'high',
        completed: false,
      })
      .select()
      .single();

    if (taskError) throw taskError;

    if (input.reminderTimes && input.reminderTimes.length > 0) {
      const reminders = input.reminderTimes.map((remindAt) => ({
        task_id: taskRow.id,
        remind_at: remindAt.toISOString(),
      }));
      const { data: insertedReminders, error: reminderError } = await supabase
        .from('task_reminders')
        .insert(reminders)
        .select();
      if (reminderError) throw reminderError;

      if (insertedReminders) {
        for (const reminder of insertedReminders) {
          try {
            const notificationId = await scheduleReminder(
              taskRow.id,
              new Date(reminder.remind_at),
              input.title
            );
            if (notificationId) {
              await supabase
                .from('task_reminders')
                .update({ notification_id: notificationId })
                .eq('id', reminder.id);
            }
          } catch (err) {
            console.warn('[TaskService] Failed to schedule reminder notification:', err);
          }
        }
      }
    }

    const map = readIdMap();
    map[localId] = taskRow.id;
    writeIdMap(map);

    const cached = readCache().map((t) => (t.id === localId ? { ...t, id: taskRow.id } : t));
    writeCache(cached);
  }

  if (operation.type === 'update') {
    const { id, updates } = operation.payload as {
      id: string;
      updates: Partial<Task> & { reminderTimes?: Date[] };
    };
    const resolvedId = resolveTaskId(id);
    await updateTask(resolvedId, updates);
  }

  if (operation.type === 'delete') {
    const { id } = operation.payload as { id: string };
    const resolvedId = resolveTaskId(id);
    await deleteTask(resolvedId);
  }
});
