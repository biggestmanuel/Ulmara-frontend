# React Native Animation Performance Guide
*Reference this file before writing or reviewing any animation, gesture, or transition code.*

## The Core Rule
During any animation or gesture, the JS thread should do **nothing**. All motion math lives on the UI thread via worklets. JS gets touched once at the start (setup) and once at the end (commit final state) — never per-frame.

---

## 1. Setup Checklist (do this first, every project)

- [ ] React Native **New Architecture** enabled (Fabric + TurboModules)
- [ ] **Hermes** as the JS engine
- [ ] `react-native-reanimated` (latest, v3+) installed and configured
- [ ] `react-native-gesture-handler` installed for all touch interactions
- [ ] `@shopify/flash-list` instead of `FlatList` for any scrollable list
- [ ] Always profile/test in **release mode**, not dev/debug — dev mode can be 2-3x slower and will give false negatives

---

## 2. Animated Values

**Rule:** Anything that changes during a gesture or animation must be a `useSharedValue`, never `useState`.

```js
// ❌ Bad — triggers a React re-render every frame
const [x, setX] = useState(0);

// ✅ Good — lives on UI thread, zero re-renders
const x = useSharedValue(0);
const style = useAnimatedStyle(() => ({
  transform: [{ translateX: x.value }],
}));
```

- Only read/write shared values **inside worklets** (`useAnimatedStyle`, `useDerivedValue`, `runOnUI`, gesture callbacks).
- Never read a shared value's `.value` in the component body/render — that reintroduces JS-thread coupling.

---

## 3. Gestures

**Rule:** Use `Gesture.Pan()` / `Gesture.Tap()` etc. from Gesture Handler, not `PanResponder`. Update shared values in `.onUpdate`, and only touch React state in `.onEnd`.

```js
const translateY = useSharedValue(0);

const gesture = Gesture.Pan()
  .onUpdate((e) => {
    translateY.value = e.translationY; // UI thread, every frame — no re-render
  })
  .onEnd(() => {
    translateY.value = withSpring(0);
    runOnJS(setIsOpen)(true); // JS thread touched ONCE, at the end
  });
```

- `runOnJS` is an escape hatch — use it for one-time triggers only (haptics, analytics, final state commit). Never call it every frame.
- Split **visual state** (position, scale, opacity → shared values, updates every frame) from **logical state** (is this open/selected/active → React state, updates once at gesture end).

---

## 4. Context & Global State

**Rule:** Never put animated/frequently-changing values in React Context.

- Context updates re-render *every* consumer of that context, with no granularity.
- If multiple components need the same shared value, pass the `SharedValue` object itself as a prop (the ref, not `.value`) — this does not cause re-renders.
- Don't dispatch to Redux/Zustand/any global store on every gesture tick. Commit once, in `.onEnd`.

---

## 5. Re-render Hygiene

**Rule:** Nothing near the animated component should re-render while it's animating.

- Wrap any component that sits inside or near an animated tree in `React.memo`.
- Never pass inline functions or objects as props to animated children — they get a new reference every render, defeating memoization. Use `useCallback` / `useMemo`, or hoist them outside the render function.
- A parent re-rendering re-renders its children even if their own props are unchanged — audit the parent chain, not just the animated component itself.

---

## 6. Lists

- Use `FlashList`, not `FlatList`, for anything beyond a single screen of items.
- Set `estimatedItemSize` accurately.
- Memoize `renderItem` and row components with `React.memo`.
- Avoid inline `renderItem={() => ...}` — hoist it out and wrap in `useCallback`.

---

## 7. Common Mistakes That Kill Fluidity

| Symptom | Likely cause |
|---|---|
| Animation stutters when data loads | JS thread blocked by fetch/parse logic during animation |
| Gesture feels laggy/delayed | Using `PanResponder` instead of Gesture Handler |
| Smooth in isolation, janky in real app | Parent re-rendering due to Context or unmemoized props |
| Fine on iOS, janky on Android | Testing in dev mode, or missing Hermes/New Arch |
| List scroll janks | `FlatList` instead of `FlashList`, or no `estimatedItemSize` |
| Animation "jumps" instead of interrupts smoothly | State-driven animation (`useState`) instead of `withSpring`/`withTiming` on a shared value |

---

## 8. Debugging Workflow

1. Test in a **release build** first — rule out dev-mode overhead.
2. Open the **Hermes Sampling Profiler** or Flipper — check if the JS thread is busy during the janky moment.
3. If JS thread is busy: find what's running (re-render? fetch? context update?) and move it off the animation path.
4. If JS thread is idle and it's still janky: check for missing `useNativeDriver`-equivalent (shared values), unmemoized shadow tree changes, or oversized images/heavy `View` nesting.

---

## AI Assistant Instructions

When writing or reviewing any animation, gesture, or transition code in this codebase:
1. Confirm all animated values use `useSharedValue`, not `useState`.
2. Confirm gestures use `react-native-gesture-handler`, not `PanResponder`.
3. Confirm no React state, Context, or store dispatch happens inside `.onUpdate` or per-frame callbacks — only in `.onEnd` via `runOnJS`.
4. Confirm animated components and their parents are memoized appropriately.
5. Flag any list over ~20 items still using `FlatList`.
6. If something looks janky, ask whether it was tested in release mode before assuming it's a code problem.
