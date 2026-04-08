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
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
  },
}));

import fc from 'fast-check';
import { validateEmail, validatePassword, validateRegisterForm } from '../auth.service';

// Feature: study-buddy-app, Property 1: Email validation
describe('Property 1: Email validation', () => {
  test('Valid emails should pass', () => {
    const validEmails = [
      'user@example.com',
      'user.name@domain.org',
      'user+tag@sub.domain.co.uk',
      'test123@university.edu',
      'a@b.io',
    ];
    for (const email of validEmails) {
      expect(validateEmail(email)).toBe(true);
    }
  });

  test('Invalid emails should fail', () => {
    const invalidEmails = [
      '',
      'notanemail',
      '@nodomain.com',
      'missing@',
      'missing@domain',
      'spaces in@email.com',
      'double@@domain.com',
    ];
    for (const email of invalidEmails) {
      expect(validateEmail(email)).toBe(false);
    }
  });

  test('Random strings without @ should be rejected', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.includes('@')),
        (str) => {
          expect(validateEmail(str)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('local@domain.tld formats should pass', () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
    const alphaChars = 'abcdefghijklmnopqrstuvwxyz'.split('');
    fc.assert(
      fc.property(
        fc.tuple(
          fc.stringOf(fc.constantFrom(...chars), { minLength: 1, maxLength: 20 }),
          fc.stringOf(fc.constantFrom(...chars), { minLength: 1, maxLength: 20 }),
          fc.stringOf(fc.constantFrom(...alphaChars), { minLength: 2, maxLength: 6 })
        ),
        ([local, domain, tld]) => {
          const email = `${local}@${domain}.${tld}`;
          expect(validateEmail(email)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: study-buddy-app, Property 2: Password length validation
describe('Property 2: Password length validation', () => {
  test('Length < 8 should fail', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 7 }), (password) => {
        expect(validatePassword(password)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  test('Length >= 8 should pass', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 8 }), (password) => {
        expect(validatePassword(password)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test('Boundary: 8 chars should pass', () => {
    expect(validatePassword('12345678')).toBe(true);
  });

  test('Boundary: 7 chars should fail', () => {
    expect(validatePassword('1234567')).toBe(false);
  });

  test('Empty string should fail', () => {
    expect(validatePassword('')).toBe(false);
  });
});

// Feature: study-buddy-app, Property 3: Required fields validation
describe('Property 3: Required fields validation', () => {
  test('Blank name should fail and include errors.name', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 })
        ),
        (blankName) => {
          const result = validateRegisterForm({
            name: blankName,
            email: 'test@example.com',
            password: 'securepassword',
          });
          expect(result.valid).toBe(false);
          expect(result.errors.name).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Blank email should fail and include errors.email', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
        fc.oneof(
          fc.constant(''),
          fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 })
        ),
        (name, blankEmail) => {
          const result = validateRegisterForm({ name, email: blankEmail, password: 'securepassword' });
          expect(result.valid).toBe(false);
          expect(result.errors.email).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Blank password should fail and include errors.password', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
        fc.oneof(
          fc.constant(''),
          fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 })
        ),
        (name, blankPassword) => {
          const result = validateRegisterForm({ name, email: 'test@example.com', password: blankPassword });
          expect(result.valid).toBe(false);
          expect(result.errors.password).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('All fields valid should pass with empty errors', () => {
    const result = validateRegisterForm({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'securepassword',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  test('Multiple blank fields should include all errors', () => {
    const result = validateRegisterForm({ name: '', email: '', password: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
    expect(result.errors.email).toBeDefined();
    expect(result.errors.password).toBeDefined();
  });
});
