// Mock dependencies
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    delete: jest.fn(),
    getNumber: jest.fn().mockReturnValue(null),
  })),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }) },
  },
}));

jest.mock('../task.service', () => ({
  createTask: jest.fn().mockResolvedValue({ id: 'task-id-1' }),
}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[xxx]' }),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `studybuddy://${path}`),
  openURL: jest.fn(),
}));

import fc from 'fast-check';
import { autoDiscoverUrl } from '../ical-sync.service';

// ─── Property 36: iCal URL 格式验证与自动发现 ──────────────────────────────────

// Feature: study-buddy-app, Property 36: iCal URL 格式验证与自动发现
describe('属性 36：iCal URL 格式验证与自动发现', () => {
  // Validates: Requirements 16.3, 16.6, 16.7

  // Feature: study-buddy-app, Property 36: iCal URL 格式验证与自动发现
  test('包含合法 Moodle iCal URL 的 HTML 应返回该 URL', () => {
    const validUrl =
      'https://lms.latrobe.edu.au/calendar/export_execute.php?preset_what=all&preset_time=recentupcoming&userid=12345&authtoken=abc123def456';

    const html = `<html><body><a href="${validUrl}">Export Calendar</a></body></html>`;
    const result = autoDiscoverUrl(html);
    expect(result).toBe(validUrl);
  });

  test('HTML 中 &amp; 编码的 URL 应被正确解码', () => {
    const encodedUrl =
      'https://lms.latrobe.edu.au/calendar/export_execute.php?preset_what=all&amp;userid=12345&amp;authtoken=abc123';
    const html = `<a href="${encodedUrl}">Calendar</a>`;
    const result = autoDiscoverUrl(html);
    expect(result).toBe(encodedUrl.replace(/&amp;/g, '&'));
  });

  // Feature: study-buddy-app, Property 36: iCal URL 格式验证与自动发现
  test('不含 /calendar/export_execute.php 的 HTML 应返回 null', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }).filter(
          (s) => !s.includes('/calendar/export_execute.php')
        ),
        (html) => {
          expect(autoDiscoverUrl(html)).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: study-buddy-app, Property 36: iCal URL 格式验证与自动发现
  test('含路径但缺少 userid 参数的 URL 应返回 null', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[a-z0-9]+$/.test(s)),
        (token) => {
          const html = `<a href="https://lms.example.edu/calendar/export_execute.php?authtoken=${token}">x</a>`;
          expect(autoDiscoverUrl(html)).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: study-buddy-app, Property 36: iCal URL 格式验证与自动发现
  test('含路径但缺少 authtoken 参数的 URL 应返回 null', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 999999 }),
        (userId) => {
          const html = `<a href="https://lms.example.edu/calendar/export_execute.php?userid=${userId}">x</a>`;
          expect(autoDiscoverUrl(html)).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: study-buddy-app, Property 36: iCal URL 格式验证与自动发现
  test('同时含有 userid 和 authtoken 的合法 URL 应被发现', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 999999 }),
        fc.string({ minLength: 8, maxLength: 32 }).filter((s) => /^[a-z0-9]+$/.test(s)),
        (userId, token) => {
          const url = `https://lms.latrobe.edu.au/calendar/export_execute.php?userid=${userId}&authtoken=${token}`;
          const html = `<a href="${url}">Export</a>`;
          const result = autoDiscoverUrl(html);
          expect(result).toBe(url);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 34: iCal 事件去重正确性 ────────────────────────────────────────

// Feature: study-buddy-app, Property 34: iCal 事件去重正确性
describe('属性 34：iCal 事件去重正确性（去重逻辑单元测试）', () => {
  // Validates: Requirements 16.5

  /**
   * Tests the deduplication logic in isolation:
   * Given a set of already-synced UIDs and a list of incoming UIDs,
   * only UIDs not in the synced set should be processed.
   */
  function deduplicateUids(incomingUids: string[], syncedUids: Set<string>): string[] {
    return incomingUids.filter((uid) => !syncedUids.has(uid));
  }

  // Feature: study-buddy-app, Property 34: iCal 事件去重正确性
  test('已同步的 UID 不应出现在待处理列表中', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 20 }),
        fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
        (allUids, extraSynced) => {
          // Pick some UIDs as already synced
          const syncedUids = new Set([...allUids.slice(0, Math.floor(allUids.length / 2)), ...extraSynced]);
          const toProcess = deduplicateUids(allUids, syncedUids);

          for (const uid of toProcess) {
            expect(syncedUids.has(uid)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: study-buddy-app, Property 34: iCal 事件去重正确性
  test('重复提交相同 UID 集合，待处理列表应为空', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 20 }),
        (uids) => {
          const syncedUids = new Set(uids);
          const toProcess = deduplicateUids(uids, syncedUids);
          expect(toProcess).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 35: iCal 解析 Round-Trip ───────────────────────────────────────

// Feature: study-buddy-app, Property 35: iCal 解析 Round-Trip
describe('属性 35：iCal 解析 Round-Trip', () => {
  // Validates: Requirements 16.9

  function buildICalEvent(uid: string, summary: string, dtstart: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = dtstart;
    const dtStr = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//StudyBuddy//Test//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `SUMMARY:${summary}`,
      `DTSTART:${dtStr}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  // Feature: study-buddy-app, Property 35: iCal 解析 Round-Trip
  test('解析 iCal 后 SUMMARY 和 DTSTART 应与原始数据一致', () => {
    // Use ical.js directly to verify round-trip
    const ICAL = require('ical.js');

    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('\n') && !s.includes('\r')),
        fc.date({ min: new Date(2025, 0, 1), max: new Date(2030, 11, 31) }),
        (uid, summary, dtstart) => {
          const icalText = buildICalEvent(uid, summary, dtstart);

          const jcal = ICAL.parse(icalText);
          const comp = new ICAL.Component(jcal);
          const vevents = comp.getAllSubcomponents('vevent');

          expect(vevents).toHaveLength(1);

          const event = new ICAL.Event(vevents[0]);
          expect(event.uid).toBe(uid);
          expect(event.summary).toBe(summary);

          // DTSTART should match to the second (UTC)
          const parsedDate = event.startDate.toJSDate();
          expect(Math.abs(parsedDate.getTime() - dtstart.getTime())).toBeLessThan(1000);
        }
      ),
      { numRuns: 100 }
    );
  });
});
