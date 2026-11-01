'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface UIState {
  /** User preference. `system` = follow OS until an explicit choice is made. */
  theme: Theme;
  /** What is actually applied to <html> right now. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  setResolvedTheme: (theme: ResolvedTheme) => void;
  toggleTheme: () => void;
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? systemTheme() : theme;
}

/**
 * Device-level UI preferences (theme only — language lives in the locale
 * cookie so SSR can render `lang`/`dir` correctly).
 *
 * Uses the project-wide pattern: `skipHydration: true`, rehydrated manually
 * by <ThemeController /> right after mount so server HTML and the first
 * client render stay identical. Visual theme application itself happens in
 * the pre-paint boot script (globals/layout) to avoid any flash.
 */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: (theme) =>
        set({ theme, resolvedTheme: resolveTheme(theme) }),
      setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
      toggleTheme: () =>
        set((state) => {
          const next: Theme = state.resolvedTheme === 'dark' ? 'light' : 'dark';
          return { theme: next, resolvedTheme: next };
        }),
    }),
    {
      name: 'khub-ui-storage',
      partialize: (state) => ({ theme: state.theme }),
      skipHydration: true,
    },
  ),
);
