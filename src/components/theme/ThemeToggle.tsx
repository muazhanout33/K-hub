'use client';

import { Sun, Moon } from 'lucide-react';
import { useUIStore } from '@/features/ui/useUIStore';
import { useT } from '@/components/i18n/LocaleProvider';

interface ThemeToggleProps {
  /** Variant for the mobile drawer (full-width labeled row). */
  variant?: 'icon' | 'drawer';
  className?: string;
  onNavigate?: () => void;
}

/**
 * Sun = light mode is active, Moon = dark mode is active.
 * Clicking applies the opposite mode as an explicit user choice, which then
 * takes priority over the OS preference (persisted in `khub-ui-storage`).
 */
export function ThemeToggle({ variant = 'icon', className, onNavigate }: ThemeToggleProps) {
  const t = useT();
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);
  const setTheme = useUIStore((s) => s.setTheme);

  const isDark = resolvedTheme === 'dark';
  const label = isDark ? t('nav.themeLight') : t('nav.themeDark');
  const Icon = isDark ? Sun : Moon;

  const handleClick = () => {
    setTheme(isDark ? 'light' : 'dark');
    onNavigate?.();
  };

  if (variant === 'drawer') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`flex items-center gap-2.5 w-full px-4 py-3 rounded-xl text-[14px] font-medium text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors ${className ?? ''}`}
        aria-label={t('common.toggleTheme')}
        title={label}
      >
        <Icon className="w-4 h-4" aria-hidden="true" />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`h-11 w-11 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors shrink-0 ${className ?? ''}`}
      aria-label={`${t('common.toggleTheme')} — ${label}`}
      title={label}
    >
      <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
    </button>
  );
}
