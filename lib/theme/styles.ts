import type { ThemeColors } from './index';

/**
 * Theme-aware stylesheet factory with a per-theme cache.
 *
 * ## Why
 *
 * Almost every screen in this app follows the same shape:
 *
 * ```ts
 * function getStyles(colors: ThemeColors) { return StyleSheet.create({ ... }); }
 * ...
 * const styles = getStyles(colors);   // inside the component body
 * ```
 *
 * That rebuilds the whole style object on **every render** — dozens of object
 * allocations plus a `StyleSheet.create` call per frame — and, worse, returns a
 * **new identity** each time. The new identity is what actually hurts: any
 * `React.memo` child that receives `styles` as a prop re-renders on every
 * parent render even when nothing about it changed, so memoising the row
 * components (which the lists depend on) does nothing.
 *
 * `ThemeColors` only ever has two possible values — `lightTheme` and
 * `darkTheme`, both stable module-level objects — so a `WeakMap` keyed on the
 * colors object reference turns this into a lookup after the first call per
 * theme, and keeps the style identity stable for the app's lifetime.
 *
 * ## Usage
 *
 * ```ts
 * const getStyles = defineStyles((colors: ThemeColors) => StyleSheet.create({ ... }));
 * ```
 *
 * Call sites stay `getStyles(colors)`; nothing else changes.
 */
const cache = new WeakMap<ThemeColors, unknown>();

export function defineStyles<T>(factory: (colors: ThemeColors) => T): (colors: ThemeColors) => T {
  return (colors: ThemeColors): T => {
    const cached = cache.get(colors) as T | undefined;
    if (cached !== undefined) return cached;
    const created = factory(colors);
    cache.set(colors, created);
    return created;
  };
}
