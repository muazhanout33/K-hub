/**
 * Centralized audio service for notification sounds.
 *
 * Design (mobile-first, autoplay-policy compliant):
 * - Single lazily-created Audio element, reused across plays
 * - AudioContext created/resumed on the first genuine user gesture
 *   (required by Android Chrome / iOS Safari autoplay policy)
 * - Playback queue: if a sound is already in flight, additional
 *   requests are coalesced into ONE follow-up play (never dropped,
 *   never restarted mid-play → no overlap, no freeze)
 * - Requested-while-locked plays are remembered and flushed on the
 *   next unlock gesture instead of being lost
 * - Graceful failure: never throws, always catches autoplay errors;
 *   audio failure can never break notification delivery
 *
 * `soundEnabled` lives in the notification store (not here) so a
 * Settings page can toggle it without touching this module.
 */

const SOUND_PATH = '/notification.wav';

type AudioContextCtor = typeof AudioContext;

let audio: HTMLAudioElement | null = null;
let audioContext: AudioContext | null = null;

/** A play is currently awaiting the element's `ended` event. */
let playInFlight = false;
/** At least one more play was requested while one was in flight. */
let followUpQueued = false;
/** A play was requested but blocked by autoplay policy (flushed on unlock). */
let warmUpActive = false;
/** A request is waiting for the next user gesture (unlock) to start. */
let pendingUnlockPlay = false;

// ── Element ──

function handleEnded(): void {
  playInFlight = false;
  // Flush at most one coalesced follow-up; further requests while it
  // plays will coalesce again.
  if (followUpQueued) {
    followUpQueued = false;
    startPlayback();
  }
}

function handleError(): void {
  // Prevent infinite retry loops on a broken/missing sound file.
  playInFlight = false;
  followUpQueued = false;
  warmUpActive = false;
  pendingUnlockPlay = false;
}

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(SOUND_PATH);
    audio.preload = 'auto';
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
  }
  return audio;
}

// ── AudioContext (required to "unlock" on iOS/Android) ──

function getAudioContextCtor(): AudioContextCtor | undefined {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

function getAudioContext(): AudioContext | null {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  try {
    // Recreate if the context was closed (e.g. after tab discard).
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new Ctor();
    }
    return audioContext;
  } catch {
    return null;
  }
}

/**
 * Resume (or create) the AudioContext. Must be called from within a
 * genuine user gesture for the browser to honour it.
 */
export async function resumeAudioContext(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

// ── Playback ──

function startPlayback(): void {
  const el = getAudio();
  playInFlight = true;
  try {
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Autoplay blocked (no user gesture yet) or decode failure.
        // Keep the request pending so the next unlock gesture flushes
        // it; handleError() covers permanent failures.
        warmUpActive = false;
        if (el.paused) {
          playInFlight = false;
          pendingUnlockPlay = true;
        }
        // Otherwise a play is actually running — leave the in-flight
        // flag alone so the `ended` handler still drains the queue.
      });
    }
  } catch {
    playInFlight = false;
    pendingUnlockPlay = true;
  }
}

/**
 * Play the notification sound.
 *
 * - Coalesces rapid notifications: while one sound plays, further
 *   requests become a single follow-up (never restarts, never drops)
 * - Respects autoplay policy: plays immediately when unlocked,
 *   otherwise queues until the next user gesture
 * - Never throws; a failure here can never break notification delivery
 */
export function playNotificationSound(): void {
  try {
    if (playInFlight) {
      followUpQueued = true;
      return;
    }
    if (warmUpActive || pendingUnlockPlay) {
      // Already waiting for a gesture — nothing extra to do.
      return;
    }
    startPlayback();
  } catch {
    // Never let audio problems propagate.
  }
}

/**
 * Unlock audio playback. Must be called from a genuine user gesture
 * (pointer/touch/keydown). Idempotent and safe to call repeatedly.
 *
 * 1. Resumes the AudioContext (iOS/Android requirement)
 * 2. Flushes any play requested before the unlock
 * 3. Otherwise performs a silent warm-up so subsequent plays are
 *    allowed by the browser's autoplay heuristics
 */
export async function unlockAudio(): Promise<void> {
  try {
    await resumeAudioContext();

    if (pendingUnlockPlay) {
      pendingUnlockPlay = false;
      if (!playInFlight) {
        startPlayback();
        return;
      }
      followUpQueued = true;
      return;
    }

    // Silent warm-up: prove to the browser that playback was triggered
    // by a user gesture without making a sound.
    const el = getAudio();
    const previousVolume = el.volume;
    try {
      el.volume = 0;
      const playPromise = el.play();
      if (playPromise && typeof playPromise.then === 'function') {
        await playPromise;
      }
      // If a real requested play started while we awaited, don't
      // interrupt it — only stop our own silent warm-up.
      if (!playInFlight) {
        el.pause();
      }
    } catch {
      // Warm-up blocked — harmless; next gesture will retry.
    } finally {
      el.volume = previousVolume;
    }
  } catch {
    // Never let audio problems propagate.
  }
}

// ── Gesture wiring ──

let unlockListeners: Array<[keyof WindowEventMap, EventListener]> | null = null;

/**
 * Install global user-gesture listeners that unlock audio playback.
 * Returns an idempotent cleanup function. Reference-counted: multiple
 * callers share one set of listeners; the last cleanup removes them.
 */
export function installAudioUnlock(): () => void {
  if (!unlockListeners) {
    const handler = () => {
      void unlockAudio();
    };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchend', 'keydown'];
    unlockListeners = events.map((event) => [event, handler] as [keyof WindowEventMap, EventListener]);
    for (const [event, listener] of unlockListeners) {
      window.addEventListener(event, listener, { passive: true });
    }
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (!unlockListeners) return;
    for (const [event, listener] of unlockListeners) {
      window.removeEventListener(event, listener);
    }
    unlockListeners = null;
  };
}

/** Tear down audio resources (used on logout / full teardown). */
export function disposeAudio(): void {
  try {
    if (unlockListeners) {
      for (const [event, listener] of unlockListeners) {
        window.removeEventListener(event, listener);
      }
      unlockListeners = null;
    }
    playInFlight = false;
    followUpQueued = false;
    warmUpActive = false;
    pendingUnlockPlay = false;
    if (audio) {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      try {
        audio.pause();
      } catch {
        // ignore
      }
      audio = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      try {
        void audioContext.close();
      } catch {
        // ignore
      }
    }
    audioContext = null;
  } catch {
    // Never let audio teardown propagate.
  }
}
