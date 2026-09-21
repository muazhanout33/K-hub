import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitContactAction } from './contact.actions';

// Mock Supabase server client
const mockInsert = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockResolvedValue({ data: null, error: null });
});

describe('submitContactAction', () => {
  const validPayload = {
    name: 'John Doe',
    email: 'john@example.com',
    subject: 'Inquiry',
    message: 'Hello, I have a question.',
  };

  it('returns success for valid payload', async () => {
    const result = await submitContactAction(validPayload);
    expect(result.success).toBe(true);
    expect(mockInsert).toHaveBeenCalledOnce();
  });

  it('returns error when name is missing', async () => {
    const result = await submitContactAction({ ...validPayload, name: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('All fields are required');
  });

  it('returns error when email is missing', async () => {
    const result = await submitContactAction({ ...validPayload, email: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('All fields are required');
  });

  it('returns error when subject is missing', async () => {
    const result = await submitContactAction({ ...validPayload, subject: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('All fields are required');
  });

  it('returns error when message is missing', async () => {
    const result = await submitContactAction({ ...validPayload, message: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('All fields are required');
  });

  it('trims whitespace before validation', async () => {
    const result = await submitContactAction({
      ...validPayload,
      name: '   ',
      email: '   ',
      subject: '   ',
      message: '   ',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('All fields are required');
  });

  it('rejects invalid email format', async () => {
    const result = await submitContactAction({ ...validPayload, email: 'not-an-email' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('valid email');
  });

  it('rejects name longer than 200 characters', async () => {
    const result = await submitContactAction({ ...validPayload, name: 'A'.repeat(201) });
    expect(result.success).toBe(false);
    expect(result.error).toContain('200 characters');
  });

  it('rejects subject longer than 200 characters', async () => {
    const result = await submitContactAction({ ...validPayload, subject: 'A'.repeat(201) });
    expect(result.success).toBe(false);
    expect(result.error).toContain('200 characters');
  });

  it('rejects message longer than 5000 characters', async () => {
    const result = await submitContactAction({ ...validPayload, message: 'A'.repeat(5001) });
    expect(result.success).toBe(false);
    expect(result.error).toContain('5000 characters');
  });

  it('returns error on database failure', async () => {
    mockInsert.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const result = await submitContactAction(validPayload);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to send message');
  });

  it('returns error on thrown exception', async () => {
    mockInsert.mockRejectedValue(new Error('Unexpected'));
    const result = await submitContactAction(validPayload);
    expect(result.success).toBe(false);
    expect(result.error).toContain('unexpected error');
  });

  it('accepts name at exactly 200 characters', async () => {
    const result = await submitContactAction({ ...validPayload, name: 'A'.repeat(200) });
    expect(result.success).toBe(true);
  });

  it('accepts message at exactly 5000 characters', async () => {
    const result = await submitContactAction({ ...validPayload, message: 'A'.repeat(5000) });
    expect(result.success).toBe(true);
  });
});
