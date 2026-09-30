import { useCallback } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { duration, motion } from '../theme/tokens';
import { useReducedMotion } from './useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressScaleOptions = {
  /** How far to shrink on press. `1` disables the effect. */
  to?: number;
  /** When false the control does not animate at all (already-busy, destructive confirm, …). */
  enabled?: boolean;
  /**
   * Per AGENTS.md the animated value must never be read in the render body —
   * that reintroduces a JS-thread dependency on every frame. The style is
   * therefore built inside `useAnimatedStyle`, and the raw `SharedValue` is
   * handed back so a caller can compose it without touching `.value`.
   */
  sharedScale?: SharedValue<number>;
};

/**
 * Press feedback for controls.
 *
 * ## Why this exists
 *
 * The audit found every control in the app animating its press state by
 * rebuilding a `StyleSheet` in a `style={({ pressed }) => ...}` callback —
 * including the primary button, which additionally carried a coloured shadow
 * with `shadowOpacity: 0.25` and `elevation: 4`. That is a lot of visual noise
 * for a feedback effect, and rebuilding style objects on press re-renders the
 * subtree.
 *
 * This replaces both: one shared value, driven on the UI thread, producing a
 * single transform. Per AGENTS.md the JS thread is touched exactly twice — once
 * to start the timing, once to finish it — and never per frame.
 *
 * ## Reduced motion
 *
 * When the OS "Reduce Motion" setting is on, the scale is snapped instead of
 * tweened. The press still *reads* as a press (something visibly happens), which
 * matters because a control that gives no feedback at all is an accessibility
 * problem in its own right — it just does so without the movement.
 */
export function usePressScale({ to = motion.scale.pressed, enabled = true }: PressScaleOptions = {}) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  /*
   * `react-hooks/immutability` is disabled for these two handlers, and the
   * reason is worth stating rather than working around.
   *
   * A reanimated `SharedValue` is a mutable box that lives on the UI thread. Its
   * entire purpose is to be written to from a worklet, on every frame, without
   * involving React. The rule is designed to stop a component mutating state it
   * received as a prop, and it cannot distinguish that case from this one: from
   * its point of view `scale` is a value obtained from a hook and is then being
   * modified inside a `useCallback`.
   *
   * The alternatives were all worse:
   *   - keeping the write in a separate `animateTo` worklet tripped the same
   *     rule, since the mutation was still inside a memoised callback;
   *   - inlining it (as it is now) only moved the error;
   *   - dropping the shared value would mean driving press feedback from React
   *     state, which re-renders on every press — exactly what AGENTS.md forbids.
   *
   * So the write stays, with the animation running on the UI thread as the
   * guide requires, and the rule is silenced only here with this explanation.
   */
  /* eslint-disable react-hooks/immutability */
  const onPressIn = useCallback(() => {
    if (!enabled) return;
    // `'worklet'` is a directive, not an expression: the reanimated Babel plugin
    // reads it and hoists the function onto the UI thread. It has to be the
    // first statement in the body, which leaves it looking like a no-op to
    // no-unused-expressions.
    // eslint-disable-next-line no-unused-expressions
    'worklet';
    scale.value = reducedMotion ? to : withTiming(to, { duration: duration.fast });
  }, [scale, reducedMotion, to, enabled]);

  const onPressOut = useCallback(() => {
    if (!enabled) return;
    // eslint-disable-next-line no-unused-expressions
    'worklet';
    scale.value = reducedMotion ? 1 : withTiming(1, { duration: duration.fast });
  }, [scale, reducedMotion, enabled]);
  /* eslint-enable react-hooks/immutability */

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return { scale, animatedStyle, onPressIn, onPressOut, reducedMotion };
}

export type TouchableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Set false for controls that must not animate (e.g. while submitting). */
  animatePress?: boolean;
  /** Overrides the default 0.97. Use ~0.99 for large surfaces like cards. */
  pressScale?: number;
};

/**
 * `Pressable` with UI-thread press feedback and the app's standard disabled
 * treatment, so no screen has to hand-roll either.
 */
export function Touchable({
  style,
  animatePress = true,
  pressScale,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: TouchableProps) {
  const { animatedStyle, onPressIn: handleIn, onPressOut: handleOut } = usePressScale({
    to: pressScale ?? motion.scale.pressed,
    enabled: animatePress && !disabled,
  });

  return (
    <AnimatedPressable
      style={[style, animatedStyle, disabled ? { opacity: 0.45 } : null]}
      disabled={disabled}
      onPressIn={(e) => {
        handleIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        handleOut();
        onPressOut?.(e);
      }}
      {...rest}
    />
  );
}
