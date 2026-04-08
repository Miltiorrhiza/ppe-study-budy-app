import NetInfo from '@react-native-community/netinfo';
import { MMKV } from 'react-native-mmkv';
import { supabase } from '../lib/supabase';
import type { Note, CreateNoteInput } from '../types';
import { enqueue, registerSyncHandler } from '../lib/offline-queue';

const noteCache = new MMKV({ id: 'note-cache' });
const NOTE_CACHE_KEY = 'notes';
const idMapStorage = new MMKV({ id: 'note-id-map' });
const NOTE_ID_MAP_KEY = 'note_id_map';

function readCache(): Note[] {
  const raw = noteCache.getString(NOTE_CACHE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Note[];
    return parsed.map((note) => ({
      ...note,
      createdAt: new Date(note.createdAt),
      updatedAt: new Date(note.updatedAt),
    }));
  } catch {
    return [];
  }
}

function writeCache(notes: Note[]): void {
  noteCache.set(NOTE_CACHE_KEY, JSON.stringify(notes));
}

function readIdMap(): Record<string, string> {
  const raw = idMapStorage.getString(NOTE_ID_MAP_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeIdMap(map: Record<string, string>): void {
  idMapStorage.set(NOTE_ID_MAP_KEY, JSON.stringify(map));
}

function resolveNoteId(id: string): string {
  if (!id.startsWith('local-')) return id;
  const map = readIdMap();
  return map[id] ?? id;
}

function upsertCachedNote(note: Note): void {
  const cached = readCache();
  const idx = cached.findIndex((n) => n.id === note.id);
  if (idx >= 0) {
    cached[idx] = note;
  } else {
    cached.push(note);
  }
  writeCache(cached);
}

function removeCachedNote(id: string): void {
  const cached = readCache().filter((n) => n.id !== id);
  writeCache(cached);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Note {
  return {
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id ?? null,
    title: row.title ?? '',
    content: row.content ?? '',
    updatedAt: new Date(row.updated_at),
    createdAt: new Date(row.created_at),
  };
}

export async function createNote(input: CreateNoteInput, userId: string): Promise<Note> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    const localId = `local-${Date.now()}`;
    const localNote: Note = {
      id: localId,
      userId,
      courseId: input.courseId ?? null,
      title: input.title ?? '',
      content: input.content ?? '',
      updatedAt: new Date(),
      createdAt: new Date(),
    };
    upsertCachedNote(localNote);
    enqueue({
      type: 'create',
      resource: 'note',
      payload: { localId, userId, input },
    });
    return localNote;
  }

  const { data, error } = await supabase
    .from('notes')
    .insert({
      user_id: userId,
      course_id: input.courseId ?? null,
      title: input.title ?? '',
      content: input.content ?? '',
    })
    .select()
    .single();

  if (error) throw error;
  const note = mapRow(data);
  upsertCachedNote(note);
  return note;
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<Note> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    const cached = readCache();
    const idx = cached.findIndex((n) => n.id === id);
    if (idx >= 0) {
      cached[idx] = {
        ...cached[idx],
        ...updates,
        courseId: updates.courseId ?? cached[idx].courseId,
        updatedAt: new Date(),
      };
      writeCache(cached);
      enqueue({
        type: 'update',
        resource: 'note',
        payload: { id, updates },
      });
      return cached[idx];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbUpdates: Record<string, any> = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.content !== undefined) dbUpdates.content = updates.content;
  if (updates.courseId !== undefined) dbUpdates.course_id = updates.courseId;
  dbUpdates.updated_at = new Date().toISOString();

  const resolvedId = resolveNoteId(id);
  const { error } = await supabase.from('notes').update(dbUpdates).eq('id', resolvedId);
  if (error) throw error;

  const { data, error: fetchError } = await supabase
    .from('notes')
    .select('*')
    .eq('id', resolvedId)
    .single();
  if (fetchError) throw fetchError;

  const note = mapRow(data);
  upsertCachedNote(note);
  return note;
}

export async function deleteNote(id: string): Promise<void> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    removeCachedNote(id);
    enqueue({
      type: 'delete',
      resource: 'note',
      payload: { id },
    });
    return;
  }

  const resolvedId = resolveNoteId(id);
  const { error } = await supabase.from('notes').delete().eq('id', resolvedId);
  if (error) throw error;
  removeCachedNote(id);
}

export async function getNotes(userId: string, courseId?: string | null): Promise<Note[]> {
  try {
    let query = supabase.from('notes').select('*').eq('user_id', userId).order('updated_at', {
      ascending: false,
    });

    if (courseId) {
      query = query.eq('course_id', courseId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const notes = (data ?? []).map(mapRow);
    const cached = readCache();
    const idMap = readIdMap();
    const localNotes = cached.filter((n) => n.id.startsWith('local-') && !idMap[n.id]);
    const merged = [...notes, ...localNotes];
    writeCache(merged);
    return merged;
  } catch (err) {
    console.warn('[NoteService] getNotes fallback to cache:', err);
    const cached = readCache();
    return courseId ? cached.filter((note) => note.courseId === courseId) : cached;
  }
}

export async function getNoteById(id: string): Promise<Note> {
  const resolvedId = resolveNoteId(id);
  try {
    const { data, error } = await supabase.from('notes').select('*').eq('id', resolvedId).single();
    if (error) throw error;
    const note = mapRow(data);
    upsertCachedNote(note);
    return note;
  } catch (err) {
    const cached = readCache().find((n) => n.id === id || n.id === resolvedId);
    if (cached) return cached;
    throw err;
  }
}

export async function searchNotes(userId: string, query: string): Promise<Note[]> {
  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const lowerQuery = query.toLowerCase();
    return (data ?? [])
      .filter((row) => {
        const titleMatch = row.title?.toLowerCase().includes(lowerQuery);
        const contentMatch = row.content?.toLowerCase().includes(lowerQuery);
        return titleMatch || contentMatch;
      })
      .map(mapRow);
  } catch (err) {
    console.warn('[NoteService] searchNotes fallback to cache:', err);
    const lowerQuery = query.toLowerCase();
    return readCache().filter(
      (note) =>
        note.title.toLowerCase().includes(lowerQuery) ||
        note.content.toLowerCase().includes(lowerQuery)
    );
  }
}

const autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function autoSaveDraft(id: string, content: string, delayMs = 30000): void {
  if (autoSaveTimers.has(id)) {
    clearTimeout(autoSaveTimers.get(id));
  }

  const timer = setTimeout(() => {
    updateNote(id, { content }).catch((err) => {
      console.warn('[NoteService] autoSaveDraft failed:', err);
    });
  }, delayMs);

  autoSaveTimers.set(id, timer);
}

registerSyncHandler('note', async (operation) => {
  if (operation.type === 'create') {
    const { localId, userId, input } = operation.payload as {
      localId: string;
      userId: string;
      input: CreateNoteInput;
    };

    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: userId,
        course_id: input.courseId ?? null,
        title: input.title ?? '',
        content: input.content ?? '',
      })
      .select()
      .single();

    if (error) throw error;

    const map = readIdMap();
    map[localId] = data.id;
    writeIdMap(map);

    const cached = readCache().map((note) =>
      note.id === localId ? { ...note, id: data.id } : note
    );
    writeCache(cached);
  }

  if (operation.type === 'update') {
    const { id, updates } = operation.payload as { id: string; updates: Partial<Note> };
    const resolvedId = resolveNoteId(id);
    await updateNote(resolvedId, updates);
  }

  if (operation.type === 'delete') {
    const { id } = operation.payload as { id: string };
    const resolvedId = resolveNoteId(id);
    await deleteNote(resolvedId);
  }
});
