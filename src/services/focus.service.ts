import { recordFocusSession } from './stats.service';

type FocusPhase = 'focus' | 'break';

export interface FocusTimerState {
  phase: FocusPhase;
  remainingSec: number;
  focusDurationSec: number;
  breakDurationSec: number;
  isRunning: boolean;
  isPaused: boolean;
  taskId: string | null;
  startedAt: Date | null;
}

let state: FocusTimerState | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(current: FocusTimerState) => void>();
let pendingSession:
  | { taskId: string | null; durationSec: number; startedAt: Date; endedAt: Date }
  | null = null;

function notify() {
  if (!state) return;
  listeners.forEach((fn) => fn(state));
}

function stopInterval() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function startInterval() {
  stopInterval();
  intervalId = setInterval(() => {
    if (!state || !state.isRunning || state.isPaused) return;
    state.remainingSec -= 1;
    if (state.remainingSec <= 0) {
      handlePhaseComplete();
    }
    notify();
  }, 1000);
}

function handlePhaseComplete() {
  if (!state) return;
  if (state.phase === 'focus') {
    const endedAt = new Date();
    const startedAt = state.startedAt ?? new Date(endedAt.getTime() - state.focusDurationSec * 1000);
    pendingSession = {
      taskId: state.taskId,
      durationSec: state.focusDurationSec,
      startedAt,
      endedAt,
    };
    state.phase = 'break';
    state.remainingSec = state.breakDurationSec;
    state.startedAt = new Date();
  } else {
    state.phase = 'focus';
    state.remainingSec = state.focusDurationSec;
    state.isRunning = false;
    state.isPaused = false;
    stopInterval();
  }
}

export function startSession(taskId?: string | null, durationMinutes = 25, breakMinutes = 5): FocusTimerState {
  state = {
    phase: 'focus',
    remainingSec: durationMinutes * 60,
    focusDurationSec: durationMinutes * 60,
    breakDurationSec: breakMinutes * 60,
    isRunning: true,
    isPaused: false,
    taskId: taskId ?? null,
    startedAt: new Date(),
  };
  startInterval();
  notify();
  return state;
}

export function pause(): void {
  if (!state) return;
  state.isPaused = true;
  notify();
}

export function resume(): void {
  if (!state) return;
  state.isPaused = false;
  state.isRunning = true;
  startInterval();
  notify();
}

export function reset(): void {
  if (!state) return;
  state.remainingSec = state.phase === 'focus' ? state.focusDurationSec : state.breakDurationSec;
  state.isRunning = false;
  state.isPaused = false;
  stopInterval();
  notify();
}

export async function completeSession(userId: string): Promise<void> {
  if (!state) return;
  const now = new Date();
  const startedAt = state.startedAt ?? new Date(now.getTime() - state.focusDurationSec * 1000);
  const durationSec =
    state.phase === 'focus'
      ? state.focusDurationSec - state.remainingSec
      : state.focusDurationSec;

  if (durationSec > 0) {
    await recordFocusSession({
      userId,
      taskId: state.taskId,
      durationSec,
      startedAt,
      endedAt: now,
    });
  }

  pendingSession = null;
  state.isRunning = false;
  state.isPaused = false;
  stopInterval();
  notify();
}

export async function recordPendingSession(userId: string): Promise<void> {
  if (!pendingSession) return;
  await recordFocusSession({
    userId,
    taskId: pendingSession.taskId,
    durationSec: pendingSession.durationSec,
    startedAt: pendingSession.startedAt,
    endedAt: pendingSession.endedAt,
  });
  pendingSession = null;
}

export function getState(): FocusTimerState | null {
  return state;
}

export function subscribe(listener: (current: FocusTimerState) => void): () => void {
  listeners.add(listener);
  if (state) listener(state);
  return () => listeners.delete(listener);
}
