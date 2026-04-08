import { supabase } from '../lib/supabase';
import type { CompletedSession, DayStats, WeekStats, TotalStats } from '../types';

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(startOfDay(date).getTime() + 86400000);
}

function getWeekRange(date: Date): { start: Date; end: Date } {
  const day = date.getDay();
  const diffToMonday = (day + 6) % 7;
  const start = startOfDay(new Date(date.getTime() - diffToMonday * 86400000));
  const end = new Date(start.getTime() + 7 * 86400000);
  return { start, end };
}

export async function recordFocusSession(session: CompletedSession): Promise<void> {
  const { error } = await supabase.from('focus_sessions').insert({
    user_id: session.userId,
    task_id: session.taskId ?? null,
    duration_sec: session.durationSec,
    started_at: session.startedAt.toISOString(),
    ended_at: session.endedAt.toISOString(),
  });
  if (error) throw error;
}

export async function getTodayStats(userId: string): Promise<DayStats> {
  const today = new Date();
  const start = startOfDay(today);
  const end = endOfDay(today);

  const { data: focusRows } = await supabase
    .from('focus_sessions')
    .select('duration_sec')
    .eq('user_id', userId)
    .gte('started_at', start.toISOString())
    .lt('started_at', end.toISOString());

  const { data: completedTasks } = await supabase
    .from('tasks')
    .select('id')
    .eq('user_id', userId)
    .gte('completed_at', start.toISOString())
    .lt('completed_at', end.toISOString());

  const totalFocusSec = (focusRows ?? []).reduce(
    (sum: number, row: { duration_sec: number }) => sum + (row.duration_sec ?? 0),
    0
  );

  return {
    date: start,
    totalFocusSec,
    completedSessions: (focusRows ?? []).length,
    completedTasks: (completedTasks ?? []).length,
  };
}

export async function getWeeklyStats(userId: string): Promise<WeekStats> {
  const today = new Date();
  const { start, end } = getWeekRange(today);

  const { data: focusRows } = await supabase
    .from('focus_sessions')
    .select('duration_sec, started_at')
    .eq('user_id', userId)
    .gte('started_at', start.toISOString())
    .lt('started_at', end.toISOString());

  const dailyStats: DayStats[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start.getTime() + i * 86400000);
    dailyStats.push({
      date,
      totalFocusSec: 0,
      completedSessions: 0,
      completedTasks: 0,
    });
  }

  for (const row of focusRows ?? []) {
    const rowDate = new Date(row.started_at);
    const idx = Math.floor((startOfDay(rowDate).getTime() - start.getTime()) / 86400000);
    if (idx >= 0 && idx < dailyStats.length) {
      dailyStats[idx].totalFocusSec += row.duration_sec ?? 0;
      dailyStats[idx].completedSessions += 1;
    }
  }

  const totalFocusSec = dailyStats.reduce((sum, day) => sum + day.totalFocusSec, 0);

  return {
    weekStart: start,
    weekEnd: end,
    dailyStats,
    totalFocusSec,
  };
}

export async function getTotalStats(userId: string): Promise<TotalStats> {
  const { data: focusRows } = await supabase
    .from('focus_sessions')
    .select('duration_sec')
    .eq('user_id', userId);

  const { data: completedTasks } = await supabase
    .from('tasks')
    .select('id')
    .eq('user_id', userId)
    .eq('completed', true);

  const totalFocusSec = (focusRows ?? []).reduce(
    (sum: number, row: { duration_sec: number }) => sum + (row.duration_sec ?? 0),
    0
  );

  return {
    totalFocusSec,
    totalSessions: (focusRows ?? []).length,
    totalTasksCompleted: (completedTasks ?? []).length,
  };
}
