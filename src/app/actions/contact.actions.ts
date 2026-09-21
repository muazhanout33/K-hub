'use server';

import { createClient } from '@/lib/supabase/server';

export interface ContactSubmissionPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface ContactSubmissionResult {
  success: boolean;
  error?: string;
}

/**
 * Server Action: Submit a contact form message to public.contact_submissions.
 * RLS policy "Public insert contact submissions" allows anonymous INSERT.
 */
export async function submitContactAction(
  payload: ContactSubmissionPayload
): Promise<ContactSubmissionResult> {
  try {
    const supabase = await createClient();

    const name = payload.name?.trim();
    const email = payload.email?.trim();
    const subject = payload.subject?.trim();
    const message = payload.message?.trim();

    if (!name || !email || !subject || !message) {
      return { success: false, error: 'All fields are required.' };
    }

    if (name.length > 200) {
      return { success: false, error: 'Name must be 200 characters or fewer.' };
    }

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    if (subject.length > 200) {
      return { success: false, error: 'Subject must be 200 characters or fewer.' };
    }

    if (message.length > 5000) {
      return { success: false, error: 'Message must be 5000 characters or fewer.' };
    }

    const { error } = await (supabase.from('contact_submissions') as any).insert({
      name,
      email,
      subject,
      message,
    });

    if (error) {
      return { success: false, error: 'Failed to send message. Please try again later.' };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'An unexpected error occurred.' };
  }
}
