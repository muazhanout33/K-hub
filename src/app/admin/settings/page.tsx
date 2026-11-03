'use client';

import { useCallback, useEffect, useState } from 'react';
import { Info, Save, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import {
  getSettingsAction,
  updateSettingsAction,
} from '@/app/actions/settings.actions';
import {
  SETTING_DEFS,
  SETTING_SECTIONS,
  parseDraftValue,
  SettingDef,
  SettingSection,
  SettingValue,
} from '@/lib/settings-registry';
import { useNotificationStore } from '@/features/notifications/useNotificationStore';
import { playNotificationSound } from '@/lib/audio';

type Drafts = Record<string, string>;

/** String form used for text/time/number drafts and boolean switch drafts. */
function toDraft(value: SettingValue): string {
  return String(value);
}

function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'amber' }) {
  const tones =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
      : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-[#171F1A] dark:text-[#8A9A8E] dark:border-[#344239]';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tones}`}
    >
      {children}
    </span>
  );
}

export default function AdminSettingsPage() {
  const { user, isRedirecting, isAdmin } = useAdminGuard();

  const soundEnabled = useNotificationStore((s) => s.soundEnabled);
  const toggleSound = useNotificationStore((s) => s.toggleSound);

  const [values, setValues] = useState<Record<string, SettingValue> | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [defaultKeys, setDefaultKeys] = useState<Set<string>>(new Set());
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ── Load (admin-gated server action; server re-verifies every call) ──
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const result = await getSettingsAction();
        if (cancelled) return;
        if (result.success && result.values) {
          setValues(result.values);
          setDefaultKeys(new Set(result.defaultKeys ?? []));
          setSavedKeys(new Set());
          setDrafts(
            Object.fromEntries(
              Object.entries(result.values).map(([key, value]) => [key, toDraft(value)])
            )
          );
        } else {
          setLoadError(result.error || 'Unable to load settings. Please try again.');
        }
      } catch {
        if (!cancelled) {
          setLoadError('Unable to load settings. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, reloadKey]);

  const handleRetry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const handleDraftChange = (key: string, raw: string) => {
    setDrafts((prev) => ({ ...prev, [key]: raw }));
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSaveError(null);
  };

  const handleToggleBoolean = (key: string) => {
    const next = drafts[key] === 'true' ? 'false' : 'true';
    handleDraftChange(key, next);
  };

  const isSectionDirty = (section: SettingSection): boolean => {
    if (!values) return false;
    return section.keys.some((key) => {
      const def = SETTING_DEFS[key];
      const raw = drafts[key] ?? '';
      if (def.type === 'boolean') {
        return (raw === 'true') !== values[key];
      }
      const parsed = parseDraftValue(def, raw);
      if (!parsed.ok) return true; // invalid drafts keep Save enabled to surface the error
      return parsed.value !== values[key];
    });
  };

  const handleSave = async (section: SettingSection) => {
    if (!values || savingSection) return;

    const payload: Record<string, SettingValue> = {};
    const errors: Record<string, string> = {};

    for (const key of section.keys) {
      const def = SETTING_DEFS[key];
      const raw = drafts[key] ?? '';
      if (def.type === 'boolean') {
        const value = raw === 'true';
        if (value !== values[key]) payload[key] = value;
      } else {
        const parsed = parseDraftValue(def, raw);
        if (!parsed.ok) {
          errors[key] = parsed.error;
          continue;
        }
        if (parsed.value !== values[key]) payload[key] = parsed.value;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...errors }));
      toast.error('Please fix the highlighted fields.');
      return;
    }
    if (Object.keys(payload).length === 0) {
      toast.success('No changes to save.');
      return;
    }

    setSavingSection(section.id);
    setSaveError(null);
    try {
      const result = await updateSettingsAction(payload);
      if (result.success && result.values) {
        const persisted = result.values;
        const updated = new Set(result.updatedKeys ?? []);
        setValues(persisted);
        setSavedKeys((prev) => new Set([...prev, ...updated]));
        setDefaultKeys((prev) => {
          const next = new Set(prev);
          updated.forEach((key) => next.delete(key));
          return next;
        });
        // Sync drafts with persisted (coerced) values so the UI reflects
        // exactly what the database stored.
        setDrafts((prev) => {
          const next = { ...prev };
          updated.forEach((key) => {
            next[key] = toDraft(persisted[key]);
          });
          return next;
        });
        setFieldErrors({});
        toast.success(
          `Saved ${updated.size} setting${updated.size === 1 ? '' : 's'}.`
        );
      } else {
        if (result.fieldErrors) {
          setFieldErrors((prev) => ({ ...prev, ...result.fieldErrors! }));
        }
        const message = result.error || 'Could not save settings. Please try again.';
        setSaveError(message);
        toast.error(message);
      }
    } catch {
      const message = 'Could not save settings. Please try again.';
      setSaveError(message);
      toast.error(message);
    } finally {
      setSavingSection(null);
    }
  };

  if (isRedirecting) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500 dark:text-[#8A9A8E]">Checking access...</p>
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  const firstLoad = loading && values === null;
  if (firstLoad) {
    return (
      <div className="min-h-[80vh] px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto space-y-5" aria-busy="true">
          <p className="text-sm text-gray-500 dark:text-[#8A9A8E]" role="status">
            Loading settings...
          </p>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#1D2821] rounded-2xl border border-[var(--border)] p-6 space-y-4 animate-pulse"
            >
              <div className="h-4 w-48 bg-gray-200 dark:bg-[#26332A] rounded" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="h-16 bg-gray-100 dark:bg-[#171F1A] rounded-xl" />
                <div className="h-16 bg-gray-100 dark:bg-[#171F1A] rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loadError && values === null) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-red-500 dark:text-red-400" role="alert">
          {loadError}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const allDefault =
    values !== null && defaultKeys.size >= Object.keys(SETTING_DEFS).length;

  const renderField = (def: SettingDef) => {
    const key = def.key;
    const raw = drafts[key] ?? '';
    const error = fieldErrors[key];
    const isDefault = defaultKeys.has(key);
    const wasSaved = savedKeys.has(key);
    const inputId = `setting-${key}`;

    return (
      <div key={key} className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={inputId}
            className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-[#8A9A8E]"
          >
            {def.label}
            {def.unit ? ` (${def.unit})` : ''}
          </label>
          <Badge tone="amber">Stored only</Badge>
          {isDefault && <Badge>Default</Badge>}
          {!isDefault && wasSaved && <Badge>Saved</Badge>}
        </div>

        {def.type === 'boolean' ? (
          <button
            id={inputId}
            type="button"
            role="switch"
            aria-checked={raw === 'true'}
            data-testid={`setting-toggle-${key}`}
            onClick={() => handleToggleBoolean(key)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              raw === 'true' ? 'bg-amber-500' : 'bg-gray-300 dark:bg-[#344239]'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                raw === 'true' ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        ) : def.type === 'time' ? (
          <input
            id={inputId}
            data-testid={`setting-input-${key}`}
            type="time"
            value={raw}
            onChange={(e) => handleDraftChange(key, e.target.value)}
            aria-invalid={error ? true : undefined}
            className="w-full max-w-xs rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A]"
          />
        ) : def.type === 'number' ? (
          <input
            id={inputId}
            data-testid={`setting-input-${key}`}
            type="number"
            inputMode="numeric"
            min={def.min}
            max={def.max}
            step={def.step ?? 1}
            value={raw}
            onChange={(e) => handleDraftChange(key, e.target.value)}
            aria-invalid={error ? true : undefined}
            className="w-full max-w-xs rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A]"
          />
        ) : (
          <input
            id={inputId}
            data-testid={`setting-input-${key}`}
            type="text"
            maxLength={def.max}
            value={raw}
            onChange={(e) => handleDraftChange(key, e.target.value)}
            aria-invalid={error ? true : undefined}
            className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A]"
          />
        )}

        <p className="text-[11px] text-gray-400 dark:text-[#8A9A8E]">{def.description}</p>
        {error && (
          <p className="text-[11px] font-medium text-red-500 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-[80vh] px-4 sm:px-6 py-6 sm:py-8">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Stored-only explanation banner */}
        <div
          className="rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 flex items-start gap-2"
          role="note"
        >
          <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Booking, club, and system settings below are saved securely in the
            database, but are <strong>not yet enforced</strong> by the live
            booking and payment flows. They define the platform&apos;s
            operational defaults for a future enforcement step.
          </p>
        </div>

        {allDefault && (
          <div
            className="rounded-2xl border border-gray-200 dark:border-[#344239] bg-gray-50 dark:bg-[#171F1A] px-4 py-3"
            role="status"
            data-testid="settings-empty-banner"
          >
            <p className="text-sm text-gray-600 dark:text-[#A1ADA4]">
              No custom settings saved yet — every value below is the default.
              Edit any field and press Save to persist it.
            </p>
          </div>
        )}

        {saveError && (
          <div
            className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3"
            role="alert"
            data-testid="settings-save-error"
          >
            <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {SETTING_SECTIONS.map((section) => {
            const dirty = isSectionDirty(section);
            const saving = savingSection === section.id;
            return (
              <section
                key={section.id}
                data-testid={`settings-section-${section.id}`}
                className="bg-white dark:bg-[#1D2821] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)] overflow-hidden flex flex-col"
              >
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-[#344239]">
                  <h2 className="text-xs sm:text-sm font-bold text-gray-700 dark:text-[#F5F7F5] uppercase">
                    {section.title}
                  </h2>
                  <p className="text-[11px] text-gray-400 dark:text-[#8A9A8E] mt-0.5">
                    {section.description}
                  </p>
                </div>
                <div className="px-4 sm:px-6 py-4 space-y-4 flex-1">
                  {section.keys.map((key) => renderField(SETTING_DEFS[key]))}
                </div>
                <div className="px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-[#344239] flex items-center justify-end gap-3 bg-gray-50/50 dark:bg-[#171F1A]/50">
                  {saving && (
                    <span className="text-[11px] text-gray-500 dark:text-[#8A9A8E]" role="status">
                      Saving...
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSave(section)}
                    disabled={!dirty || saving || savingSection !== null}
                    data-testid={`settings-save-${section.id}`}
                    className="px-4 py-2 rounded-xl bg-gray-900 dark:bg-[#26332A] text-white text-xs font-bold hover:bg-gray-800 dark:hover:bg-[#344239] transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900"
                  >
                    <Save className="w-3 h-3" aria-hidden="true" /> Save
                  </button>
                </div>
              </section>
            );
          })}

          {/* Notifications — client-only, persisted Zustand store (no DB) */}
          <section
            data-testid="settings-section-notifications"
            className="bg-white dark:bg-[#1D2821] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)] overflow-hidden flex flex-col"
          >
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-[#344239]">
              <h2 className="text-xs sm:text-sm font-bold text-gray-700 dark:text-[#F5F7F5] uppercase">
                Notifications
              </h2>
              <p className="text-[11px] text-gray-400 dark:text-[#8A9A8E] mt-0.5">
                Sound preferences for incoming booking and payment alerts on
                this device.
              </p>
            </div>
            <div className="px-4 sm:px-6 py-4 space-y-4 flex-1">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    id="notification-sound-label"
                    className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-[#8A9A8E]"
                  >
                    Notification sound
                  </span>
                  <Badge>This device</Badge>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundEnabled}
                    aria-labelledby="notification-sound-label"
                    data-testid="notification-sound-toggle"
                    onClick={toggleSound}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      soundEnabled ? 'bg-green-600' : 'bg-gray-300 dark:bg-[#344239]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        soundEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  {soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-green-600" aria-hidden="true" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-gray-400 dark:text-[#8A9A8E]" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    onClick={playNotificationSound}
                    data-testid="test-sound-button"
                    className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-[#344239] text-xs font-bold text-gray-600 dark:text-[#F5F7F5] hover:bg-gray-50 dark:hover:bg-[#171F1A] transition-colors"
                  >
                    Play test sound
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-[#8A9A8E]">
                  Play a short chime to preview the alert sound. The setting is
                  saved on this device and survives page reloads.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
