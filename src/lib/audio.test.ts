import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  playNotificationSound,
  unlockAudio,
  resumeAudioContext,
  installAudioUnlock,
  disposeAudio,
} from '@/lib/audio';

/**
 * Regression tests for notification audio:
 *  - autoplay-policy unlock on a genuine user gesture
 *  - rapid notifications coalesce (no restart / no overlap / no drop)
 *  - blocked plays are remembered and flushed on unlock
 *  - error events never cause retry loops
 *  - installAudioUnlock is reference-counted
 *  - audio failures never throw (delivery must not break)
 */

type MediaState = {
  playCalls: number;
  pauseCalls: number;
  rejectNextPlay: boolean;
};

let media: MediaState;
let capturedElement: HTMLAudioElement | null = null;

/** Flush pending microtasks + one macrotask (lets async unlock finish). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The element the audio module is currently using. */
function currentAudio(): HTMLAudioElement {
  if (!capturedElement) throw new Error('audio element not captured');
  return capturedElement;
}

describe('audio service', () => {
  beforeEach(() => {
    media = { playCalls: 0, pauseCalls: 0, rejectNextPlay: false };

    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement
    ) {
      media.playCalls += 1;
      if (media.rejectNextPlay) {
        media.rejectNextPlay = false;
        // Autoplay blocked: element stays paused, promise rejects.
        return Promise.reject(new DOMException('NotAllowedError')) as never;
      }
      Object.defineProperty(this, 'paused', { value: false, configurable: true });
      return Promise.resolve() as never;
    });

    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLMediaElement
    ) {
      media.pauseCalls += 1;
      Object.defineProperty(this, 'paused', { value: true, configurable: true });
    });
  });

  afterEach(() => {
    disposeAudio();
    vi.restoreAllMocks();
  });

  it('plays a sound on first request', () => {
    playNotificationSound();
    expect(media.playCalls).toBe(1);
  });

  it('never throws, even if play() throws synchronously', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      throw new Error('element not allowed');
    });
    expect(() => playNotificationSound()).not.toThrow();
    await expect(unlockAudio()).resolves.toBeUndefined();
  });

  it('coalesces rapid requests into ONE follow-up (no restart, no drop)', () => {
    playNotificationSound(); // starts play #1
    expect(media.playCalls).toBe(1);

    // Three more notifications arrive while #1 is still playing.
    playNotificationSound();
    playNotificationSound();
    playNotificationSound();
    // No restart mid-play.
    expect(media.playCalls).toBe(1);

    // Play #1 ends → exactly ONE follow-up plays.
    currentAudio().dispatchEvent(new Event('ended'));
    expect(media.playCalls).toBe(2);

    // No further queued plays remain.
    currentAudio().dispatchEvent(new Event('ended'));
    expect(media.playCalls).toBe(2);
  });

  it('remembers a play blocked by autoplay and flushes it on unlock', async () => {
    media.rejectNextPlay = true;
    playNotificationSound();
    expect(media.playCalls).toBe(1); // attempt happened but was blocked

    // Further requests while blocked do not stack up attempts.
    playNotificationSound();
    expect(media.playCalls).toBe(1);

    // User gesture → unlock flushes the pending play.
    await unlockAudio();
    expect(media.playCalls).toBe(2);
  });

  it('unlockAudio performs a silent warm-up when nothing is pending', async () => {
    await unlockAudio();
    expect(media.playCalls).toBe(1);
    // Warm-up pauses itself so it never makes noise.
    expect(media.pauseCalls).toBeGreaterThanOrEqual(1);
  });

  it('an error event clears state so playback can recover', () => {
    playNotificationSound();
    currentAudio().dispatchEvent(new Event('error'));

    // After an error the next request starts a fresh play (no lock-up,
    // no retry loop from the failed one).
    const before = media.playCalls;
    playNotificationSound();
    expect(media.playCalls).toBe(before + 1);

    // The errored play does NOT trigger an automatic follow-up.
    currentAudio().dispatchEvent(new Event('error'));
    currentAudio().dispatchEvent(new Event('ended'));
    expect(media.playCalls).toBe(before + 1);
  });

  it('installAudioUnlock is reference-counted', async () => {
    const release1 = installAudioUnlock();
    const release2 = installAudioUnlock();

    // First gesture → warm-up play.
    window.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(media.playCalls).toBeGreaterThanOrEqual(1);

    const afterFirstGesture = media.playCalls;

    // One release must NOT remove the shared listeners.
    release1();
    window.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(media.playCalls).toBeGreaterThan(afterFirstGesture);

    const afterSecondGesture = media.playCalls;

    // Last release removes them.
    release2();
    window.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(media.playCalls).toBe(afterSecondGesture);

    // Double-release is a no-op.
    expect(() => release2()).not.toThrow();
  });

  it('disposeAudio resets everything without throwing', () => {
    playNotificationSound();
    expect(() => disposeAudio()).not.toThrow();
    // Fresh state: a new request starts a brand-new play.
    const before = media.playCalls;
    playNotificationSound();
    expect(media.playCalls).toBeGreaterThan(before);
  });

  it('resumeAudioContext never throws when AudioContext is unavailable', async () => {
    await expect(resumeAudioContext()).resolves.toBeTypeOf('boolean');
  });

  it('resumeAudioContext resumes a suspended context (iOS/Android unlock)', async () => {
    let ctxState = 'suspended';
    const resume = vi.fn(async () => {
      ctxState = 'running';
    });
    const FakeCtx = vi.fn(function () {
      return {
        get state() {
          return ctxState;
        },
        resume,
        close: vi.fn(),
      };
    }) as unknown as typeof AudioContext;

    Object.defineProperty(window, 'AudioContext', {
      value: FakeCtx,
      configurable: true,
    });

    try {
      const ok = await resumeAudioContext();
      expect(ok).toBe(true);
      expect(resume).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(window, 'AudioContext');
    }
  });
});

// Capture `new Audio()` so tests can dispatch ended/error on the SAME
// element the module uses. Installed at module scope — audio.ts only
// creates its element lazily on first use (inside tests).
const OriginalAudio = window.Audio;
window.Audio = function (src?: string) {
  const el = new OriginalAudio(src);
  capturedElement = el as HTMLAudioElement;
  return el;
} as unknown as typeof Audio;
