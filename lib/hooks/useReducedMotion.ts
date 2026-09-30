import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS "Reduce Motion" / "Remove Animations" accessibility setting.
 *
 * The audit that preceded the redesign found **no reduced-motion handling
 * anywhere in the app**, which is both an accessibility gap and, for a wallet,
 * a comfort problem: motion is harder to tolerate when you are reading numbers
 * you care about.
 *
 * `AccessibilityInfo.isReduceMotionEnabled()` is the documented source of truth
 * and it also emits `reduceMotionChanged`, so this stays correct when the user
 * flips the setting while the app is open — no restart required.
 *
 * ## Per AGENTS.md
 *
 * Motion in this app is limited to short, non-essential feedback (press
 * emphasis, sheet entry, toast). None of it is load-bearing, so honouring
 * reduced motion means simply not running it — there is no information carried
 * by a transition that would need a non-animated equivalent.
 *
 * Animated values themselves live on the UI thread via `useSharedValue` and
 * `withTiming`, per the animation guide; this hook only decides *whether* they
 * should be driven at all.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduced(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => setReduced(enabled)
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}
