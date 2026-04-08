import { MMKV } from 'react-native-mmkv';
import NetInfo from '@react-native-community/netinfo';

const storage = new MMKV({ id: 'offline-queue' });
const QUEUE_KEY = 'offline_operations';

export type OperationType = 'create' | 'update' | 'delete';
export type ResourceType = 'task' | 'note' | 'course';

export interface OfflineOperation {
  id: string;
  type: OperationType;
  resource: ResourceType;
  payload: Record<string, unknown>;
  createdAt: number;
}

type SyncHandler = (operation: OfflineOperation) => Promise<void>;

const handlers = new Map<ResourceType, SyncHandler>();

export function registerSyncHandler(resource: ResourceType, handler: SyncHandler): void {
  handlers.set(resource, handler);
}

export function enqueue(operation: Omit<OfflineOperation, 'id' | 'createdAt'>): void {
  const queue = getQueue();
  const op: OfflineOperation = {
    ...operation,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
  };
  queue.push(op);
  storage.set(QUEUE_KEY, JSON.stringify(queue));
}

export function getQueue(): OfflineOperation[] {
  const raw = storage.getString(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as OfflineOperation[];
  } catch {
    return [];
  }
}

export function clearQueue(): void {
  storage.delete(QUEUE_KEY);
}

export function removeFromQueue(id: string): void {
  const queue = getQueue().filter((op) => op.id !== id);
  storage.set(QUEUE_KEY, JSON.stringify(queue));
}

export async function processQueue(): Promise<void> {
  const queue = getQueue();
  if (queue.length === 0) return;

  for (const op of queue) {
    const handler = handlers.get(op.resource);
    if (!handler) {
      continue;
    }
    try {
      await handler(op);
      removeFromQueue(op.id);
    } catch (err) {
      console.warn('[OfflineQueue] Failed to process operation:', op, err);
      break;
    }
  }
}

export function setupOfflineSync(): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      processQueue().catch((err) => {
        console.warn('[OfflineQueue] processQueue error:', err);
      });
    }
  });

  processQueue().catch((err) => {
    console.warn('[OfflineQueue] initial processQueue error:', err);
  });

  return () => unsubscribe();
}
