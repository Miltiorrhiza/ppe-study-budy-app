import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/auth.store';
import {
  startSession,
  pause,
  resume,
  reset,
  completeSession,
  recordPendingSession,
  getState,
  subscribe,
  FocusTimerState,
} from '../../src/services/focus.service';
import { isProUser } from '../../src/services/subscription.service';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function FocusTimerScreen() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const userId = useAuthStore((s) => s.user?.id ?? '');

  const [timerState, setTimerState] = useState<FocusTimerState | null>(getState());
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [proEnabled, setProEnabled] = useState(false);
  const [loadingPro, setLoadingPro] = useState(true);
  const prevPhase = useRef(timerState?.phase ?? null);

  useEffect(() => {
    const unsubscribe = subscribe((state) => setTimerState({ ...state }));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!userId) return;
    isProUser(userId)
      .then((isPro) => setProEnabled(isPro))
      .finally(() => setLoadingPro(false));
  }, [userId]);

  useEffect(() => {
    if (!timerState) return;
    if (prevPhase.current === 'focus' && timerState.phase === 'break') {
      recordPendingSession(userId).catch(() => {});
    }
    prevPhase.current = timerState.phase;
  }, [timerState, userId]);

  const isRunning = timerState?.isRunning ?? false;
  const isPaused = timerState?.isPaused ?? false;
  const phaseLabel = timerState?.phase === 'break' ? 'Break' : 'Focus';
  const remaining = timerState?.remainingSec ?? focusMinutes * 60;

  const canCustomize = useMemo(() => proEnabled, [proEnabled]);

  function handleStart() {
    if (!canCustomize && (focusMinutes !== 25 || breakMinutes !== 5)) {
      Alert.alert('Upgrade', 'Custom durations are available for Pro users.');
      return;
    }
    startSession(taskId ?? null, focusMinutes, breakMinutes);
  }

  function handleReset() {
    reset();
  }

  async function handleFinish() {
    await completeSession(userId);
    router.back();
  }

  return (
    <View style={styles.container}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navButton} hitSlop={8}>
          <Ionicons name="close" size={20} color="#8E8E93" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Focus Timer</Text>
        <View style={styles.navButton} />
      </View>

      <View style={styles.timerCard}>
        <Text style={styles.phaseLabel}>{phaseLabel}</Text>
        <Text style={styles.timerValue}>{formatTime(remaining)}</Text>

        <View style={styles.controls}>
          {isRunning && !isPaused ? (
            <TouchableOpacity style={styles.controlButton} onPress={pause}>
              <Ionicons name="pause" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.controlButton} onPress={resume}>
              <Ionicons name="play" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.controlButton} onPress={handleReset}>
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={handleStart}>
            <Ionicons name="caret-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.durationCard}>
        <Text style={styles.sectionTitle}>Durations</Text>
        {loadingPro ? (
          <ActivityIndicator color="#FF3B30" />
        ) : (
          <>
            <View style={styles.durationRow}>
              <Text style={styles.durationLabel}>Focus</Text>
              <View style={styles.durationControls}>
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => setFocusMinutes(Math.max(5, focusMinutes - 5))}
                  disabled={!canCustomize}
                >
                  <Text style={styles.smallButtonText}>-5</Text>
                </TouchableOpacity>
                <Text style={styles.durationValue}>{focusMinutes} min</Text>
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => setFocusMinutes(Math.min(60, focusMinutes + 5))}
                  disabled={!canCustomize}
                >
                  <Text style={styles.smallButtonText}>+5</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.durationRow}>
              <Text style={styles.durationLabel}>Break</Text>
              <View style={styles.durationControls}>
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => setBreakMinutes(Math.max(5, breakMinutes - 5))}
                  disabled={!canCustomize}
                >
                  <Text style={styles.smallButtonText}>-5</Text>
                </TouchableOpacity>
                <Text style={styles.durationValue}>{breakMinutes} min</Text>
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => setBreakMinutes(Math.min(30, breakMinutes + 5))}
                  disabled={!canCustomize}
                >
                  <Text style={styles.smallButtonText}>+5</Text>
                </TouchableOpacity>
              </View>
            </View>

            {!canCustomize ? (
              <Text style={styles.proNote}>Upgrade to Pro to customize durations.</Text>
            ) : null}
          </>
        )}
      </View>

      <TouchableOpacity style={styles.finishButton} onPress={handleFinish}>
        <Text style={styles.finishButtonText}>Finish Session</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
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
  timerCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  phaseLabel: {
    fontSize: 14,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  timerValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  controls: {
    flexDirection: 'row',
    gap: 12,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationCard: {
    backgroundColor: '#111114',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 12,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  durationLabel: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  durationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  durationValue: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  smallButton: {
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  smallButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  proNote: {
    color: '#8E8E93',
    fontSize: 12,
  },
  finishButton: {
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  finishButtonText: {
    color: '#000000',
    fontWeight: '700',
  },
});
