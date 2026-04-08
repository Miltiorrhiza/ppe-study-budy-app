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
  },
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    delete: jest.fn(),
    getNumber: jest.fn().mockReturnValue(null),
  })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn().mockReturnValue(() => {}),
}));

import fc from 'fast-check';
import {
  validateTaskTitle,
  validateDueDate,
  getDaysUntilDue,
  filterTasks,
  groupTasks,
  createTask,
  markComplete,
  searchTasks,
} from '../task.service';
import { supabase } from '../../lib/supabase';
import type { Task, CreateTaskInput } from '../../types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    userId: 'user-1',
    courseId: null,
    title: 'Test Task',
    description: null,
    dueAt: new Date(Date.now() + 86400000 * 3),
    priority: 'high',
    completed: false,
    completedAt: null,
    reminders: [],
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const taskArb = fc.record({
  id: fc.uuid(),
  userId: fc.uuid(),
  courseId: fc.option(fc.uuid(), { nil: null }),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
  dueAt: fc.date({ min: new Date(2020, 0, 1), max: new Date(2030, 11, 31) }),
  priority: fc.constantFrom('high' as const, 'medium' as const, 'low' as const),
  completed: fc.boolean(),
  completedAt: fc.option(fc.date(), { nil: null }),
  reminders: fc.constant([]),
  attachments: fc.constant([]),
  createdAt: fc.date(),
  updatedAt: fc.date(),
});

// Feature: study-buddy-app, Property 8: Due date validation
describe('Property 8: Due date validation', () => {
  test('Dates earlier than today should fail', () => {
    const now = new Date(2024, 5, 15);
    fc.assert(
      fc.property(
        fc.date({ min: new Date(2000, 0, 1), max: new Date(2024, 5, 14) }),
        (pastDate) => {
          expect(validateDueDate(pastDate, now)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Today or future dates should pass', () => {
    const now = new Date(2024, 5, 15);
    fc.assert(
      fc.property(
        fc.date({ min: new Date(2024, 5, 15), max: new Date(2030, 11, 31) }),
        (futureDate) => {
          expect(validateDueDate(futureDate, now)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: study-buddy-app, Property 10: Task create round-trip
describe('Property 10: Task create round-trip', () => {
  test('Created task should match input', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 50 }),
          courseId: fc.option(fc.uuid(), { nil: null }),
          dueAt: fc.date({ min: new Date(2025, 0, 1), max: new Date(2030, 11, 31) }),
          priority: fc.constantFrom('high' as const, 'medium' as const, 'low' as const),
        }),
        async (input: CreateTaskInput) => {
          const taskId = 'round-trip-id';
          const dbRow = {
            id: taskId,
            user_id: 'user-1',
            course_id: input.courseId ?? null,
            title: input.title,
            description: null,
            due_at: input.dueAt.toISOString(),
            priority: input.priority ?? 'high',
            completed: false,
            completed_at: null,
            task_reminders: [],
            task_attachments: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const mockFrom = jest.fn().mockReturnValue({
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: dbRow, error: null }),
              }),
            }),
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: dbRow, error: null }),
              }),
            }),
          });
          (supabase.from as jest.Mock).mockImplementation(mockFrom);

          const task = await createTask(input, 'user-1');

          expect(task.title).toBe(input.title);
          expect(task.courseId).toBe(input.courseId ?? null);
          expect(task.priority).toBe(input.priority ?? 'high');
          expect(task.completed).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: study-buddy-app, Property 11: Task filtering
describe('Property 11: Task filtering', () => {
  test('filter=all returns all tasks', () => {
    fc.assert(
      fc.property(fc.array(taskArb, { minLength: 0, maxLength: 20 }), (tasks) => {
        const result = filterTasks(tasks, { type: 'all' });
        expect(result).toHaveLength(tasks.length);
      }),
      { numRuns: 100 }
    );
  });

  test('filter=completed returns only completed tasks', () => {
    fc.assert(
      fc.property(fc.array(taskArb, { minLength: 0, maxLength: 20 }), (tasks) => {
        const result = filterTasks(tasks, { type: 'completed' });
        for (const t of result) {
          expect(t.completed).toBe(true);
        }
        const completedCount = tasks.filter((t) => t.completed).length;
        expect(result).toHaveLength(completedCount);
      }),
      { numRuns: 100 }
    );
  });

  test('filter=upcoming returns only incomplete tasks', () => {
    fc.assert(
      fc.property(fc.array(taskArb, { minLength: 0, maxLength: 20 }), (tasks) => {
        const result = filterTasks(tasks, { type: 'upcoming' });
        for (const t of result) {
          expect(t.completed).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: study-buddy-app, Property 12: Task grouping
describe('Property 12: Task grouping', () => {
  test('Completed tasks should only appear in completed group', () => {
    fc.assert(
      fc.property(
        fc.array(taskArb, { minLength: 1, maxLength: 20 }),
        fc.date({ min: new Date(2024, 0, 1), max: new Date(2025, 11, 31) }),
        (tasks, now) => {
          const { urgent, thisWeek, completed } = groupTasks(tasks, now);

          for (const t of completed) {
            expect(t.completed).toBe(true);
          }
          for (const t of urgent) {
            expect(t.completed).toBe(false);
          }
          for (const t of thisWeek) {
            expect(t.completed).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Urgent tasks should be due within 2 days', () => {
    fc.assert(
      fc.property(
        fc.array(taskArb, { minLength: 1, maxLength: 20 }),
        fc.date({ min: new Date(2024, 0, 1), max: new Date(2025, 11, 31) }),
        (tasks, now) => {
          const { urgent } = groupTasks(tasks, now);
          for (const t of urgent) {
            const days = getDaysUntilDue(t.dueAt, now);
            expect(days).toBeLessThanOrEqual(2);
            expect(t.completed).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Each task should appear in exactly one group', () => {
    fc.assert(
      fc.property(
        fc.array(taskArb, { minLength: 0, maxLength: 20 }),
        fc.date({ min: new Date(2024, 0, 1), max: new Date(2025, 11, 31) }),
        (tasks, now) => {
          const { urgent, thisWeek, completed } = groupTasks(tasks, now);
          const total = urgent.length + thisWeek.length + completed.length;
          expect(total).toBe(tasks.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: study-buddy-app, Property 13: Task completion round-trip
describe('Property 13: Task completion round-trip', () => {
  test('markComplete sets completed=true and completed_at', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (taskId) => {
        const completedAt = new Date().toISOString();
        const dbRow = {
          id: taskId,
          user_id: 'user-1',
          course_id: null,
          title: 'Test',
          description: null,
          due_at: new Date(Date.now() + 86400000).toISOString(),
          priority: 'high',
          completed: true,
          completed_at: completedAt,
          task_reminders: [],
          task_attachments: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const mockFrom = jest.fn().mockReturnValue({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: dbRow, error: null }),
            }),
          }),
        });
        (supabase.from as jest.Mock).mockImplementation(mockFrom);

        const task = await markComplete(taskId);

        expect(task.completed).toBe(true);
        expect(task.completedAt).not.toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: study-buddy-app, Property 14: Task search correctness
describe('Property 14: Task search correctness', () => {
  test('Search results should include only tasks with keyword', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        async (keyword) => {
          const matchingRow = {
            id: 'match-1',
            user_id: 'user-1',
            course_id: null,
            title: `Assignment ${keyword} due`,
            description: null,
            due_at: new Date(Date.now() + 86400000).toISOString(),
            priority: 'high',
            completed: false,
            completed_at: null,
            task_reminders: [],
            task_attachments: [],
            courses: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const nonMatchingRow = {
            id: 'no-match-1',
            user_id: 'user-1',
            course_id: null,
            title: 'Completely unrelated',
            description: null,
            due_at: new Date(Date.now() + 86400000).toISOString(),
            priority: 'medium',
            completed: false,
            completed_at: null,
            task_reminders: [],
            task_attachments: [],
            courses: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const mockFrom = jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: [matchingRow, nonMatchingRow],
                  error: null,
                }),
              }),
            }),
          });
          (supabase.from as jest.Mock).mockImplementation(mockFrom);

          const results = await searchTasks('user-1', keyword);

          for (const task of results) {
            const titleMatch = task.title.toLowerCase().includes(keyword.toLowerCase());
            expect(titleMatch).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: study-buddy-app, Property 16: Days-until-due calculation
describe('Property 16: Days-until-due calculation', () => {
  test('Should equal ceil((dueAt - now) / 86400000)', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date(2020, 0, 1), max: new Date(2030, 11, 31) }),
        fc.date({ min: new Date(2020, 0, 1), max: new Date(2030, 11, 31) }),
        (dueAt, now) => {
          const result = getDaysUntilDue(dueAt, now);
          const expected = Math.ceil((dueAt.getTime() - now.getTime()) / 86400000);
          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('validateTaskTitle', () => {
  test('Non-empty title should pass', () => {
    expect(validateTaskTitle('Task')).toBe(true);
  });

  test('Blank title should fail', () => {
    expect(validateTaskTitle('   ')).toBe(false);
  });
});
