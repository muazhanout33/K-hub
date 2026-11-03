'use client';

import { useState } from 'react';
import { Search, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Customer } from '@/types';
import { getAdminCustomersPageAction } from '@/app/actions/customer.actions';
import { sendAdminNotificationAction } from '@/app/actions/admin-notification.actions';
import {
  ADMIN_SEND_TYPES,
  ADMIN_SEND_MAX_RECIPIENTS,
} from '@/lib/admin-notifications';

const MAX_TITLE = 255;
const MAX_MESSAGE = 2000;

const TYPE_LABELS: Record<string, string> = {
  info: 'Information',
  promo_offer: 'Promotional offer',
  booking_reminder: 'Booking reminder',
  court_full: 'Court full',
};

interface NotificationComposeDrawerProps {
  onClose: () => void;
  /** Called after a successful send so the page can refresh its list. */
  onSent: () => void;
}

const inputClass = (hasError: boolean) =>
  `w-full rounded-xl border ${hasError ? 'border-red-300 dark:border-red-500' : 'border-gray-200 dark:border-[#344239]'} px-3 py-2 text-sm text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30`;

export function NotificationComposeDrawer({ onClose, onSent }: NotificationComposeDrawerProps) {
  // Recipient picker (search reuses the admin customers read layer).
  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState<Customer[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Customer[]>([]);

  // Message fields.
  const [type, setType] = useState<string>(ADMIN_SEND_TYPES[0]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'type' | 'title' | 'message' | 'recipients', string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSelected = (id: string) => selected.some((c) => c.id === id);
  const atRecipientCap = selected.length >= ADMIN_SEND_MAX_RECIPIENTS;

  const toggleRecipient = (customer: Customer) => {
    setFieldErrors((prev) => ({ ...prev, recipients: undefined }));
    setSelected((prev) =>
      prev.some((c) => c.id === customer.id)
        ? prev.filter((c) => c.id !== customer.id)
        : atRecipientCap
          ? prev
          : [...prev, customer]
    );
  };

  const removeRecipient = (id: string) => {
    setSelected((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSearch = async () => {
    const term = searchInput.trim();
    if (!term || searching) return;

    setSearching(true);
    setSearchError(null);
    try {
      const result = await getAdminCustomersPageAction({ search: term, page: 1 });
      if (result.success && result.customers) {
        setResults(result.customers);
      } else {
        setResults(null);
        setSearchError(result.error || 'Failed to search customers.');
      }
    } catch {
      setResults(null);
      setSearchError('An unexpected error occurred.');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const trimmedTitle = title.trim();
    const trimmedMessage = message.trim();
    const errors: typeof fieldErrors = {};
    if (!ADMIN_SEND_TYPES.includes(type as (typeof ADMIN_SEND_TYPES)[number])) {
      errors.type = 'Select a valid notification type.';
    }
    if (!trimmedTitle) errors.title = 'Title is required.';
    else if (trimmedTitle.length > MAX_TITLE) errors.title = `${MAX_TITLE} characters max.`;
    if (!trimmedMessage) errors.message = 'Message is required.';
    else if (trimmedMessage.length > MAX_MESSAGE) errors.message = `${MAX_MESSAGE} characters max.`;
    if (selected.length === 0) errors.recipients = 'Select at least one recipient.';

    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      const result = await sendAdminNotificationAction({
        userIds: selected.map((c) => c.id),
        type,
        title: trimmedTitle,
        message: trimmedMessage,
      });

      if (result.success) {
        const count = result.sentCount ?? selected.length;
        toast.success(`Notification sent to ${count} customer${count === 1 ? '' : 's'}.`);
        onSent();
        onClose();
        return;
      }
      setFormError(result.error || 'Failed to send the notification.');
    } catch {
      setFormError('An unexpected error occurred.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-notification-title"
    >
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/70" onClick={busy ? undefined : onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md h-full bg-white dark:bg-[#1D2821] border-l border-[var(--border)] shadow-[var(--shadow-floating)] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-[#1D2821] border-b border-gray-100 dark:border-[#344239] px-5 py-4 flex items-center justify-between gap-3">
          <h2 id="compose-notification-title" className="text-sm font-bold text-gray-800 dark:text-[#F5F7F5] truncate">
            Send notification
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close send notification"
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--background)] disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4" noValidate>
          {/* Recipient picker */}
          <div>
            <label htmlFor="notification-recipient-search" className="block text-xs font-bold text-gray-600 dark:text-[#A1ADA4] mb-1">
              Recipients
            </label>
            <div className="flex gap-2">
              <input
                id="notification-recipient-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSearch();
                  }
                }}
                placeholder="Search name, email or phone"
                className={inputClass(false)}
              />
              <button
                type="button"
                onClick={() => void handleSearch()}
                disabled={searching}
                className="shrink-0 rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold text-[var(--primary)] border border-[var(--border)] hover:bg-[var(--background)] transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>

            {searchError && (
              <p className="mt-1 text-xs text-red-500 dark:text-red-400" role="alert">
                {searchError}
              </p>
            )}

            {results && results.length === 0 && (
              <p className="mt-2 text-xs text-gray-500 dark:text-[#8A9A8E]">No customers match that search.</p>
            )}

            {results && results.length > 0 && (
              <ul className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-gray-200 dark:border-[#344239] divide-y divide-gray-50 dark:divide-[#344239]">
                {results.map((c) => {
                  const checked = isSelected(c.id);
                  const disabled = !checked && atRecipientCap;
                  return (
                    <li key={c.id}>
                      <label
                        className={`flex items-center gap-2 px-3 py-2 text-xs ${
                          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-[#171F1A]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleRecipient(c)}
                          aria-label={`Select ${c.fullName}`}
                        />
                        <span className="min-w-0">
                          <span className="block font-bold text-gray-800 dark:text-[#F5F7F5] truncate">{c.fullName}</span>
                          <span className="block text-gray-500 dark:text-[#8A9A8E] truncate">{c.email}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            {selected.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {selected.map((c) => (
                  <li
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-[#26332A] border border-gray-200 dark:border-[#344239] pl-2.5 pr-1 py-0.5 text-xs text-gray-700 dark:text-[#F5F7F5]"
                  >
                    <span className="max-w-[140px] truncate">{c.fullName}</span>
                    <button
                      type="button"
                      onClick={() => removeRecipient(c.id)}
                      disabled={busy}
                      aria-label={`Remove ${c.fullName}`}
                      className="w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-[#344239] hover:text-gray-600 dark:hover:text-[#F5F7F5]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-1 text-[11px] text-gray-400 dark:text-[#8A9A8E]">
              {selected.length} of {ADMIN_SEND_MAX_RECIPIENTS} recipients selected.
            </p>
            {fieldErrors.recipients && (
              <p className="mt-1 text-xs text-red-500" role="alert">
                {fieldErrors.recipients}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="notification-type" className="block text-xs font-bold text-gray-600 dark:text-[#A1ADA4] mb-1">
              Type
            </label>
            <select
              id="notification-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              aria-invalid={Boolean(fieldErrors.type)}
              className={inputClass(Boolean(fieldErrors.type))}
            >
              {ADMIN_SEND_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
            {fieldErrors.type && (
              <p className="mt-1 text-xs text-red-500 dark:text-red-400" role="alert">
                {fieldErrors.type}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="notification-title" className="block text-xs font-bold text-gray-600 dark:text-[#A1ADA4] mb-1">
              Title
            </label>
            <input
              id="notification-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_TITLE}
              aria-invalid={Boolean(fieldErrors.title)}
              className={inputClass(Boolean(fieldErrors.title))}
            />
            {fieldErrors.title && (
              <p className="mt-1 text-xs text-red-500 dark:text-red-400" role="alert">
                {fieldErrors.title}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="notification-message" className="block text-xs font-bold text-gray-600 dark:text-[#A1ADA4] mb-1">
              Message
            </label>
            <textarea
              id="notification-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_MESSAGE}
              rows={4}
              aria-invalid={Boolean(fieldErrors.message)}
              className={inputClass(Boolean(fieldErrors.message))}
            />
            <p className="mt-1 text-[11px] text-gray-400 dark:text-[#8A9A8E]">
              {message.length}/{MAX_MESSAGE} characters
            </p>
            {fieldErrors.message && (
              <p className="mt-1 text-xs text-red-500 dark:text-red-400" role="alert">
                {fieldErrors.message}
              </p>
            )}
          </div>

          {formError && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2" role="alert">
              <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-[var(--radius-md)] px-4 py-2 text-xs font-bold text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--background)] transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-[var(--radius-md)] px-4 py-2 text-xs font-bold bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
