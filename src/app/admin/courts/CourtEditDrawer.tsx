'use client';

import { useState } from 'react';
import { X, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Court } from '@/types';
import {
  createCourtAction,
  updateCourtAction,
  type UpdateCourtPayload,
} from '@/app/actions/court.actions';

const EDITABLE_SPORT_TYPES = ['Football', 'Tennis', 'Padel'] as const;
const EDITABLE_STATUSES = ['Available', 'Maintenance'] as const;
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5]\d$/;
const MAX_NAME_LENGTH = 120;
const MAX_SURFACE_LENGTH = 80;
const MAX_IMAGE_URL_LENGTH = 500;

type FieldErrors = Partial<
  Record<'name' | 'surface' | 'sportType' | 'price' | 'open' | 'close' | 'status' | 'imageUrl', string>
>;

function isEditableStatus(status: string): boolean {
  return (EDITABLE_STATUSES as readonly string[]).includes(status);
}

/** Client-side mirror of the server rules — the server remains authoritative. */
function validate(values: FormValues, statusDirty: boolean): FieldErrors {
  const errors: FieldErrors = {};
  const name = values.name.trim();
  const surface = values.surface.trim();
  const imageUrl = values.imageUrl.trim();

  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    errors.name = `Name is required (${MAX_NAME_LENGTH} characters max).`;
  }
  if (surface.length === 0 || surface.length > MAX_SURFACE_LENGTH) {
    errors.surface = `Surface is required (${MAX_SURFACE_LENGTH} characters max).`;
  }
  if (!EDITABLE_SPORT_TYPES.includes(values.sportType as (typeof EDITABLE_SPORT_TYPES)[number])) {
    errors.sportType = 'Select a valid sport type.';
  }

  const price = Number(values.price);
  if (
    values.price.trim() === '' ||
    !Number.isFinite(price) ||
    price < 0 ||
    price > 100_000 ||
    Math.abs(price * 100 - Math.round(price * 100)) >= 1e-6
  ) {
    errors.price = 'Price must be 0–100,000 EGP with at most two decimals.';
  }

  if (!TIME_RE.test(values.open)) errors.open = 'Use HH:mm (e.g. 07:00).';
  if (!TIME_RE.test(values.close)) errors.close = 'Use HH:mm (e.g. 00:00).';
  if (!errors.open && !errors.close && values.open === values.close) {
    errors.close = 'Opening and closing times cannot be the same.';
  }

  // Fix #1: only validate status when the admin explicitly touched the select —
  // an untouched (possibly non-editable) current status is simply omitted.
  if (
    statusDirty &&
    !EDITABLE_STATUSES.includes(values.status as (typeof EDITABLE_STATUSES)[number])
  ) {
    errors.status = 'Status must be Available or Maintenance.';
  }

  const validImage =
    imageUrl.length > 0 &&
    imageUrl.length <= MAX_IMAGE_URL_LENGTH &&
    !/\s/.test(imageUrl) &&
    ((imageUrl.startsWith('/images/') && imageUrl.length > '/images/'.length) ||
      (() => {
        if (!imageUrl.startsWith('https://')) return false;
        try {
          const url = new URL(imageUrl);
          return url.protocol === 'https:' && url.hostname.length > 0;
        } catch {
          return false;
        }
      })());
  if (!validImage) {
    errors.imageUrl = 'Use a local /images/ path or an absolute HTTPS URL (max 500 chars).';
  }

  return errors;
}

interface FormValues {
  name: string;
  sportType: string;
  surface: string;
  price: string;
  open: string;
  close: string;
  status: string;
  imageUrl: string;
}

interface CourtEditDrawerProps {
  court: Court | null;
  /** 'edit' (default) requires `court`; 'create' renders the add-court form. */
  mode?: 'edit' | 'create';
  onClose: () => void;
  /** Called after a successful save so the page can refresh its list. */
  onSaved: () => void;
}

const inputClass = (hasError: boolean) =>
  `w-full rounded-xl border ${hasError ? 'border-red-300 dark:border-red-500' : 'border-gray-200 dark:border-[#344239]'} px-3 py-2 text-sm text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30`;

export function CourtEditDrawer({ court, mode = 'edit', onClose, onSaved }: CourtEditDrawerProps) {
  const isCreateMode = mode === 'create';
  const [values, setValues] = useState<FormValues>(() => ({
    name: court?.name ?? '',
    sportType: court?.sportType ?? 'Padel',
    surface: court?.surface ?? '',
    price: court ? String(court.pricePerHour) : '',
    open: court?.workingHours.open ?? '07:00',
    close: court?.workingHours.close ?? '00:00',
    // Fix #1: a non-editable current status (Booked / Starts Soon) starts empty
    // behind a placeholder — never a silent 'Available' fallback.
    // Create mode always starts from the DB default 'Available'.
    status: isCreateMode
      ? 'Available'
      : court && isEditableStatus(court.status)
        ? court.status
        : '',
    imageUrl: court?.image ?? '',
  }));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Fix #1: tracks whether the admin explicitly chose a status in the select.
  const [statusDirty, setStatusDirty] = useState(false);

  if (!court && !isCreateMode) return null;

  const set = (key: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusDirty(true);
    setValues((prev) => ({ ...prev, status: event.target.value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const errors = validate(values, isCreateMode || statusDirty);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      if (isCreateMode) {
        const result = await createCourtAction({
          name: values.name.trim(),
          sportType: values.sportType,
          surface: values.surface.trim(),
          pricePerHour: Number(values.price),
          workingHoursOpen: values.open,
          workingHoursClose: values.close,
          imageUrl: values.imageUrl.trim(),
          status: values.status,
        });

        if (result.success && result.court) {
          toast.success(`Court "${result.court.name}" created.`);
          onSaved();
          onClose();
          return;
        }
        setFormError(result.error || 'Failed to create the court.');
        return;
      }

      if (!court) return;

      const basePayload: UpdateCourtPayload = {
        courtId: court.id,
        name: values.name.trim(),
        sportType: values.sportType,
        surface: values.surface.trim(),
        pricePerHour: Number(values.price),
        workingHoursOpen: values.open,
        workingHoursClose: values.close,
        imageUrl: values.imageUrl.trim(),
      };
      // Fix #1: status is sent only when explicitly chosen, so saving unrelated
      // fields can never rewrite a non-editable current status (Booked/Starts Soon).
      if (statusDirty) basePayload.status = values.status;

      let result = await updateCourtAction(basePayload);

      // Advisory warning: ask before stranding existing bookings (never auto-proceed).
      if (!result.success && result.warningCode === 'OUTSIDE_WORKING_HOURS') {
        const proceed = window.confirm(`${result.error}\n\nSave anyway?`);
        if (proceed) {
          result = await updateCourtAction({ ...basePayload, acknowledgeOutsideHours: true });
        } else {
          setFormError(result.error ?? null);
          return;
        }
      }

      if (result.success && result.court) {
        toast.success(`Court "${result.court.name}" updated.`);
        onSaved();
        onClose();
        return;
      }
      setFormError(result.error || 'Failed to save court changes.');
    } catch {
      setFormError('An unexpected error occurred.');
    } finally {
      setBusy(false);
    }
  };

  const errorFor = (key: keyof FieldErrors) =>
    fieldErrors[key] ? (
      <p className="mt-1 text-xs text-red-500" role="alert">
        {fieldErrors[key]}
      </p>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="edit-court-title">
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/70" onClick={busy ? undefined : onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md h-full bg-white dark:bg-[#1D2821] border-l border-[var(--border)] shadow-[var(--shadow-floating)] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-[#1D2821] border-b border-gray-100 dark:border-[#344239] px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 text-[var(--primary)] shrink-0" aria-hidden="true" />
            <h2 id="edit-court-title" className="text-sm font-bold text-gray-800 dark:text-[#F5F7F5] truncate">
              {isCreateMode ? 'Add court' : 'Edit court'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close edit court"
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--background)] disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4" noValidate>
          <div>
            <label htmlFor="court-name" className="block text-xs font-bold text-gray-600 dark:text-[#A1ADA4] mb-1">
              Court name
            </label>
            <input
              id="court-name"
              type="text"
              value={values.name}
              onChange={set('name')}
              maxLength={MAX_NAME_LENGTH}
              aria-invalid={Boolean(fieldErrors.name)}
              className={inputClass(Boolean(fieldErrors.name))}
            />
            {errorFor('name')}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="court-sport" className="block text-xs font-bold text-gray-600 dark:text-[#A1ADA4] mb-1">
                Sport type
              </label>
              <select
                id="court-sport"
                value={values.sportType}
                onChange={set('sportType')}
                className={inputClass(Boolean(fieldErrors.sportType))}
              >
                {EDITABLE_SPORT_TYPES.map((sport) => (
                  <option key={sport} value={sport}>
                    {sport}
                  </option>
                ))}
              </select>
              {errorFor('sportType')}
            </div>
            <div>
              <label htmlFor="court-surface" className="block text-xs font-bold text-gray-600 dark:text-[#A1ADA4] mb-1">
                Surface
              </label>
              <input
                id="court-surface"
                type="text"
                value={values.surface}
                onChange={set('surface')}
                maxLength={MAX_SURFACE_LENGTH}
                aria-invalid={Boolean(fieldErrors.surface)}
                className={inputClass(Boolean(fieldErrors.surface))}
              />
              {errorFor('surface')}
            </div>
          </div>

          <div>
            <label htmlFor="court-price" className="block text-xs font-bold text-gray-600 dark:text-[#A1ADA4] mb-1">
              Hourly price (EGP)
            </label>
            <input
              id="court-price"
              type="number"
              step="0.01"
              min="0"
              max="100000"
              value={values.price}
              onChange={set('price')}
              aria-invalid={Boolean(fieldErrors.price)}
              className={inputClass(Boolean(fieldErrors.price))}
            />
            {errorFor('price')}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="court-open" className="block text-xs font-bold text-gray-600 dark:text-[#A1ADA4] mb-1">
                Opens
              </label>
              <input
                id="court-open"
                type="time"
                value={values.open}
                onChange={set('open')}
                aria-invalid={Boolean(fieldErrors.open)}
                className={inputClass(Boolean(fieldErrors.open))}
              />
              {errorFor('open')}
            </div>
            <div>
              <label htmlFor="court-close" className="block text-xs font-bold text-gray-600 dark:text-[#A1ADA4] mb-1">
                Closes
              </label>
              <input
                id="court-close"
                type="time"
                value={values.close}
                onChange={set('close')}
                aria-invalid={Boolean(fieldErrors.close)}
                className={inputClass(Boolean(fieldErrors.close))}
              />
              {errorFor('close')}
            </div>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-[#8A9A8E]">
            Overnight hours are allowed (closing earlier than opening). Changing hours never
            cancels existing bookings — you will be warned before saving.
          </p>

          <div>
            <label htmlFor="court-status" className="block text-xs font-bold text-gray-600 dark:text-[#A1ADA4] mb-1">
              Operational status
            </label>
            <select
              id="court-status"
              value={values.status}
              onChange={handleStatusChange}
              className={inputClass(Boolean(fieldErrors.status))}
            >
              {court && !isEditableStatus(court.status) && (
                <option value="" disabled>
                  {court.status} (not editable — choose a status to change it)
                </option>
              )}
              {EDITABLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            {errorFor('status')}
            <p className="mt-1 text-[11px] text-gray-400 dark:text-[#8A9A8E]">
              Maintenance blocks new bookings only; existing bookings are untouched. The current
              status is kept unless you choose a new one.
            </p>
          </div>

          <div>
            <label htmlFor="court-image" className="block text-xs font-bold text-gray-600 dark:text-[#A1ADA4] mb-1">
              Image URL
            </label>
            <input
              id="court-image"
              type="text"
              value={values.imageUrl}
              onChange={set('imageUrl')}
              maxLength={MAX_IMAGE_URL_LENGTH}
              placeholder="/images/courts/court-1.jpg"
              aria-invalid={Boolean(fieldErrors.imageUrl)}
              className={inputClass(Boolean(fieldErrors.imageUrl))}
            />
            {errorFor('imageUrl')}
            <p className="mt-1 text-[11px] text-gray-400 dark:text-[#8A9A8E]">
              Local /images/ path or absolute HTTPS URL. External URLs may currently show the
              public fallback image.
            </p>
          </div>

          <div className="rounded-xl bg-gray-50 dark:bg-[#171F1A] border border-gray-100 dark:border-[#344239] px-3 py-2">
            <p className="text-xs text-gray-500 dark:text-[#8A9A8E]">
              Slot duration:{' '}
              <span className="font-bold text-gray-700 dark:text-[#F5F7F5]">{court?.slotDurationMinutes ?? 60} min</span>{' '}
              (fixed — not editable)
            </p>
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
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
              {busy ? 'Saving…' : isCreateMode ? 'Create court' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
