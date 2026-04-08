import ICAL from 'ical.js';
import { supabase } from '../lib/supabase';
import { createTask } from './task.service';
import type { LmsIntegration, SyncResult } from '../types';

// ─── Auto-Discovery ────────────────────────────────────────────────────────────

/**
 * Scans an HTML string for a Moodle iCal export URL.
 * Matches href attributes containing /calendar/export_execute.php with userid & authtoken params.
 */
export function autoDiscoverUrl(html: string): string | null {
  // Match all href="..." or href='...' values
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const url = match[1];
    if (
      url.includes('/calendar/export_execute.php') &&
      url.includes('userid') &&
      url.includes('authtoken')
    ) {
      // Decode HTML entities (e.g. &amp; → &)
      return url.replace(/&amp;/g, '&');
    }
  }

  return null;
}

// ─── URL Validation ────────────────────────────────────────────────────────────

/**
 * Validates that a URL is accessible and returns valid iCal content.
 */
export async function validateUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return false;

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/calendar')) return true;

    const text = await response.text();
    return text.trimStart().startsWith('BEGIN:VCALENDAR');
  } catch {
    return false;
  }
}

// ─── Supabase Mappers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapIntegration(row: any): LmsIntegration {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    label: row.label ?? null,
    icalUrl: row.ical_url ?? null,
    lmsUrl: row.lms_url ?? null,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
    syncEnabled: row.sync_enabled,
    createdAt: new Date(row.created_at),
  };
}

// ─── CRUD ──────────────────────────────────────────────────────────────────────

export async function addSubscription(
  userId: string,
  icalUrl: string,
  label = 'La Trobe University Moodle'
): Promise<LmsIntegration> {
  const { data, error } = await supabase
    .from('lms_integrations')
    .insert({ user_id: userId, type: 'ical', ical_url: icalUrl, label })
    .select()
    .single();

  if (error) throw error;
  return mapIntegration(data);
}

export async function removeSubscription(integrationId: string): Promise<void> {
  const { error } = await supabase
    .from('lms_integrations')
    .delete()
    .eq('id', integrationId);
  if (error) throw error;
}

export async function getSubscriptions(userId: string): Promise<LmsIntegration[]> {
  const { data, error } = await supabase
    .from('lms_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'ical')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapIntegration);
}

// ─── Sync ──────────────────────────────────────────────────────────────────────

export async function syncNow(integrationId: string): Promise<SyncResult> {
  const result: SyncResult = { created: 0, skipped: 0, skippedReasons: [] };

  // 1. Fetch integration record
  const { data: integration, error: intError } = await supabase
    .from('lms_integrations')
    .select('*')
    .eq('id', integrationId)
    .single();

  if (intError || !integration?.ical_url) {
    throw new Error('Integration not found or missing iCal URL');
  }

  // 2. Fetch iCal data
  const response = await fetch(integration.ical_url);
  if (!response.ok) throw new Error(`Failed to fetch iCal: ${response.status}`);
  const icalText = await response.text();

  // 3. Parse iCal
  let vevents: ICAL.Component[] = [];
  try {
    const jcal = ICAL.parse(icalText);
    const comp = new ICAL.Component(jcal);
    vevents = comp.getAllSubcomponents('vevent');
  } catch (err) {
    throw new Error(`Failed to parse iCal: ${err}`);
  }

  // 4. Get already-synced UIDs
  const { data: syncedRows } = await supabase
    .from('ical_synced_events')
    .select('ical_uid')
    .eq('integration_id', integrationId);

  const syncedUids = new Set((syncedRows ?? []).map((r: { ical_uid: string }) => r.ical_uid));

  // 5. Process each VEVENT
  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    const uid = event.uid;
    const summary = event.summary ?? '';
    const dtstart = event.startDate?.toJSDate() ?? null;
    const description = vevent.getFirstPropertyValue<string>('description') ?? null;

    if (!uid) {
      result.skipped++;
      result.skippedReasons.push('Missing UID');
      continue;
    }

    if (syncedUids.has(uid)) {
      result.skipped++;
      continue;
    }

    if (!dtstart) {
      result.skipped++;
      result.skippedReasons.push(`${summary}: 缺少截止日期`);
      continue;
    }

    // Default reminder: 24 hours before due
    const reminderTime = new Date(dtstart.getTime() - 24 * 60 * 60 * 1000);
    const reminderTimes = reminderTime > new Date() ? [reminderTime] : [];

    try {
      const task = await createTask(
        {
          title: summary || 'Untitled Event',
          description,
          dueAt: dtstart,
          priority: 'high',
          reminderTimes,
        },
        integration.user_id
      );

      // Record synced event
      await supabase.from('ical_synced_events').insert({
        integration_id: integrationId,
        ical_uid: uid,
        task_id: task.id,
      });

      result.created++;
    } catch (err) {
      result.skipped++;
      result.skippedReasons.push(`${summary}: ${err}`);
    }
  }

  // 6. Update last_synced_at
  await supabase
    .from('lms_integrations')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', integrationId);

  return result;
}

// ─── Auto-Sync Scheduler ───────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Schedules automatic 24-hour sync for an integration.
 * Call on app startup after iCal is connected.
 */
export function scheduleAutoSync(integrationId: string): void {
  setInterval(async () => {
    try {
      await syncNow(integrationId);
    } catch (err) {
      console.warn('[ICalSyncService] Auto-sync failed:', err);
    }
  }, SYNC_INTERVAL_MS);
}
