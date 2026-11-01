'use client';

import { useEffect } from 'react';
import { useUIStore, resolveTheme } from './useUIStore';

function applyToDocument(resolved: 'light' | 'dark'): void {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

/**
 * Owns the translation between the persisted theme preference and the DOM.
 *
 * Mount order: this component is placed before <Navbar /> in the root layout,
 * so its effects run before any consumer of the store — by the time the
 * toggle icon renders its post-hydration state, the store is already correct.
 *
 * Responsibilities:
 *  - rehydrate the persisted preference (project-wide skipHydration pattern)
 *  - apply the resolved theme to <html>
 *  - keep following the OS preference while `theme === 'system'`
 */
export function ThemeController() {
  const theme = useUIStore((s) => s.theme);
  const setResolvedTheme = useUIStore((s) => s.setResolvedTheme);

  // Rehydrate once after mount (same contract as HydrationProvider).
  useEffect(() => {
    useUIStore.persist.rehydrate();
  }, []);

  // Apply preference to <html> whenever it changes.
  useEffect(() => {
    const resolved = resolveTheme(theme);
    applyToDocument(resolved);
    setResolvedTheme(resolved);

    if (theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      const next = event.matches ? 'dark' : 'light';
      applyToDocument(next);
      setResolvedTheme(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme, setResolvedTheme]);

  return null;
}
