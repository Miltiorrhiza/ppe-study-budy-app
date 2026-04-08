import { supabase } from '../lib/supabase';
import type { Course } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Course {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color ?? null,
    createdAt: new Date(row.created_at),
  };
}

export async function getCourses(userId: string): Promise<Course[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function getCourseById(id: string): Promise<Course | null> {
  const { data, error } = await supabase.from('courses').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}
