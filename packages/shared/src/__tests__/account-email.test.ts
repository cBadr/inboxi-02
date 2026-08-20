import { describe, it, expect } from 'vitest';
import { loginSchema, signupSchema, accountEmailSchema } from '../validation';

// Login and signup look the user up with an exact findUnique. If the two paths
// normalize differently — or not at all — a real account becomes unreachable and
// the user is told their credentials are wrong.
describe('accountEmailSchema', () => {
  it('lowercases, so a capitalized login reaches the same row as signup', () => {
    const signedUp = signupSchema.parse({ email: 'Badr@Example.com', password: 'longenough1' });
    const loggedIn = loginSchema.parse({ email: 'BADR@EXAMPLE.COM', password: 'longenough1' });
    expect(signedUp.email).toBe('badr@example.com');
    expect(loggedIn.email).toBe(signedUp.email);
  });

  it('accepts a pasted address with surrounding whitespace', () => {
    // Previously this failed validation outright with invalid_payload (422).
    expect(loginSchema.parse({ email: '  admin@inboxi.online  ', password: 'x' }).email).toBe(
      'admin@inboxi.online',
    );
  });

  it('still rejects an address that is not an email', () => {
    expect(accountEmailSchema.safeParse('not-an-email').success).toBe(false);
    expect(accountEmailSchema.safeParse('').success).toBe(false);
  });
});
