/**
 * Centralized audio service for notification sounds.
 *
 * Design:
 * - Single Audio instance, preloaded on module load
 * - Overlap protection: if a sound is already playing, restart it
 * - Cooldown: 1s minimum between plays to prevent rapid-fire
 * - Graceful failure: never throws, always catches autoplay errors
 *
 * Future-proofing:
 * - Sound path is configurable (easy to swap files)
 * - `soundEnabled` flag lives in the notification store (not here)
 *   so a Settings page can toggle it without touching this module
 */

const SOUND_PATH = '/notification.wav';
const COOLDOWN_MS = 1000;

let audio: HTMLAudioElement | null = null;
let lastPlayTime = 0;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(SOUND_PATH);
    audio.preload = 'auto';
  }
  return audio;
}

/**
 * Play the notification sound.
 *
 * - Respects cooldown (1s between plays)
 * - Prevents overlapping playback
 * - Handles browser autoplay policy gracefully
 * - Never throws
 */
export function playNotificationSound(): void {
  try {
    const now = Date.now();
    if (now - lastPlayTime < COOLDOWN_MS) return;

    const el = getAudio();

    // If already playing, restart from beginning (prevents overlap)
    if (!el.paused) {
      el.pause();
      el.currentTime = 0;
    }

    lastPlayTime = now;
    el.play().catch(() => {
      // Autoplay policy blocked playback — silent failure is acceptable.
      // The next user interaction will unlock audio for future plays.
    });
  } catch {
    // Defensive: never let audio errors propagate
  }
}

/**
 * Unlock audio playback after a user gesture.
 * Call this from any click/keydown handler to satisfy browser autoplay policy.
 */
export function unlockAudio(): void {
  try {
    const el = getAudio();
    el.currentTime = 0;
    el.play().then(() => {
      el.pause();
      el.currentTime = 0;
    }).catch(() => {
      // Still blocked — will retry on next gesture
    });
  } catch {
    // Defensive
  }
}
