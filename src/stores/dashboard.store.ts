import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { getTasks } from '../services/task.service';
import type { Task } from '../types';

interface DashboardState {
  nextDeadline: Task | null;
  todayTaskCount: number;
  todayFocusSec: number;
  upcomingTasks: Task[];
  isLoading: boolean;
}

interface DashboardActions {
  load: (userId: string) => Promise<void>;
}

export const useDashboardStore = create<DashboardState & DashboardActions>((set) => ({
  nextDeadline: null,
  todayTaskCount: 0,
  todayFocusSec: 0,
  upcomingTasks: [],
  isLoading: false,

  load: async (userId: string) => {
    set({ isLoading: true });
    try {
      // Fetch all incomplete tasks sorted by due_at asc
      const allTasks = await getTasks(userId, { type: 'all' });
      const incomplete = allTasks.filter((t) => !t.completed);

      // Next deadline: task with smallest due_at
      const nextDeadline = incomplete.length > 0
        ? incomplete.reduce((a, b) => (a.dueAt < b.dueAt ? a : b))
        : null;

      // Today task count
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 86400000);
      const todayTaskCount = incomplete.filter(
        (t) => t.dueAt >= todayStart && t.dueAt < todayEnd
      ).length;

      // Upcoming tasks: first 3 incomplete sorted by due_at
      const upcomingTasks = [...incomplete]
        .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
        .slice(0, 3);

      // Today focus seconds
      const todayFocusSec = await loadTodayFocusSec(userId, todayStart, todayEnd);

      set({ nextDeadline, todayTaskCount, todayFocusSec, upcomingTasks });
    } catch (err) {
      console.warn('[DashboardStore] load error:', err);
    } finally {
      set({ isLoading: false });
    }
  },
}));

async function loadTodayFocusSec(
  userId: string,
  todayStart: Date,
  todayEnd: Date
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('focus_sessions')
      .select('duration_sec')
      .eq('user_id', userId)
      .gte('started_at', todayStart.toISOString())
      .lt('started_at', todayEnd.toISOString());

    if (error) return 0;
    return (data ?? []).reduce((sum: number, row: { duration_sec: number }) => sum + row.duration_sec, 0);
  } catch {
    return 0;
  }
}
