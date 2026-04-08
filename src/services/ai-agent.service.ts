import { supabase } from '../lib/supabase';
import { createTask } from './task.service';
import type { ExtractedDeadline, SyncResult } from '../types';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
const OPENAI_MODEL = process.env.EXPO_PUBLIC_OPENAI_MODEL ?? 'gpt-4o-mini';

export async function extractDeadlines(html: string): Promise<ExtractedDeadline[]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'Extract all assignment deadlines from the provided HTML. Return JSON only with an array of {title, courseName, dueAt, rawText}. dueAt must be ISO string or null.',
        },
        { role: 'user', content: html },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const json = await response.json();
  let content = json.choices?.[0]?.message?.content ?? '';
  content = content.trim();
  if (content.startsWith('```')) {
    content = content.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  }

  let parsed: ExtractedDeadline[] = [];
  try {
    const obj = JSON.parse(content);
    if (Array.isArray(obj)) {
      parsed = obj as ExtractedDeadline[];
    } else if (Array.isArray(obj?.deadlines)) {
      parsed = obj.deadlines as ExtractedDeadline[];
    }
  } catch {
    throw new Error('Failed to parse AI response.');
  }

  return parsed.map((item) => ({
    title: item.title,
    courseName: item.courseName ?? null,
    dueAt: item.dueAt ? new Date(item.dueAt) : null,
    rawText: item.rawText ?? '',
  }));
}

export async function createTasksFromDeadlines(
  deadlines: ExtractedDeadline[],
  userId: string
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, skipped: 0, skippedReasons: [] };

  const { data: existingTasks } = await supabase
    .from('tasks')
    .select('title, due_at')
    .eq('user_id', userId);

  const existingSet = new Set(
    (existingTasks ?? []).map((t: { title: string; due_at: string }) =>
      `${t.title.toLowerCase()}|${new Date(t.due_at).toISOString()}`
    )
  );

  for (const item of deadlines) {
    if (!item.dueAt) {
      result.skipped++;
      result.skippedReasons.push('Missing due date');
      continue;
    }
    const title = item.title?.trim();
    if (!title) {
      result.skipped++;
      result.skippedReasons.push('Missing title');
      continue;
    }

    const key = `${title.toLowerCase()}|${item.dueAt.toISOString()}`;
    if (existingSet.has(key)) {
      result.skipped++;
      continue;
    }

    const reminderAt = new Date(item.dueAt.getTime() - 24 * 60 * 60 * 1000);
    await createTask(
      {
        title,
        description: item.rawText ?? null,
        dueAt: item.dueAt,
        priority: 'high',
        reminderTimes: reminderAt > new Date() ? [reminderAt] : [],
      },
      userId
    );

    existingSet.add(key);
    result.created++;
  }

  return result;
}
