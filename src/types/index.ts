// ---- Enums / Union Types ----

export type Priority = 'high' | 'medium' | 'low';
export type Plan = 'free' | 'pro';
export type Language = 'zh' | 'en';
export type IntegrationType = 'ical' | 'ai_agent';

// ---- Auth / User ----

export interface User {
  id: string;
  email: string;
  name: string;
  university: string | null;
  createdAt: Date;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
}

export interface UserProfile {
  id: string;
  name: string;
  university: string | null;
  pushToken?: string | null;
  pushEnabled: boolean;
  language: Language;
  createdAt: Date;
}

// ---- Course ----

export interface Course {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  createdAt: Date;
}

// ---- Task ----

export interface TaskReminder {
  id: string;
  taskId: string;
  remindAt: Date;
  notificationId: string | null;
  sent: boolean;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number; // bytes, max 20MB
  mimeType: string;
  createdAt: Date;
}

export interface Task {
  id: string;
  userId: string;
  courseId: string | null;
  title: string;
  description: string | null;
  dueAt: Date;
  priority: Priority;
  completed: boolean;
  completedAt: Date | null;
  reminders: TaskReminder[];
  attachments: TaskAttachment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  title: string;
  courseId?: string | null;
  description?: string | null;
  dueAt: Date;
  priority?: Priority;
  reminderTimes?: Date[];
}

export type TaskFilterType = 'all' | 'today' | 'upcoming' | 'completed';

export interface TaskFilter {
  type: TaskFilterType;
  query?: string;
  courseId?: string;
}

// ---- Note ----

export interface Note {
  id: string;
  userId: string;
  courseId: string | null;
  title: string;
  content: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface CreateNoteInput {
  title: string;
  content: string;
  courseId?: string | null;
}

// ---- Focus Session / Stats ----

export interface FocusSession {
  id: string;
  userId: string;
  taskId: string | null;
  durationSec: number;
  startedAt: Date;
  endedAt: Date;
}

export interface CompletedSession {
  userId: string;
  taskId: string | null;
  durationSec: number;
  startedAt: Date;
  endedAt: Date;
}

export interface DayStats {
  date: Date;
  totalFocusSec: number;
  completedSessions: number;
  completedTasks: number;
}

export interface WeekStats {
  weekStart: Date;
  weekEnd: Date;
  dailyStats: DayStats[];
  totalFocusSec: number;
}

export interface TotalStats {
  totalFocusSec: number;
  totalSessions: number;
  totalTasksCompleted: number;
}

// ---- LMS Integration / iCal ----

export interface LmsIntegration {
  id: string;
  userId: string;
  type: IntegrationType;
  label: string | null;
  icalUrl: string | null;
  lmsUrl: string | null;
  lastSyncedAt: Date | null;
  syncEnabled: boolean;
  createdAt: Date;
}

export interface SyncResult {
  created: number;
  skipped: number;
  skippedReasons: string[];
}

export interface ExtractedDeadline {
  title: string;
  courseName: string | null;
  dueAt: Date | null;
  rawText: string;
}

// ---- Subscription ----

export interface Subscription {
  id: string;
  userId: string;
  plan: Plan;
  provider: 'app_store' | 'google_play' | 'stripe' | null;
  expiresAt: Date | null;
  revenuecatUserId: string | null;
  updatedAt: Date;
}
