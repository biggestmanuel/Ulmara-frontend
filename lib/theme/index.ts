import { create } from 'zustand';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { darkTheme, lightTheme, type ThemeColors } from './color';

export type ThemeMode = 'dark' | 'light' | 'system';

// `darkTheme`, `lightTheme` and `ThemeColors` are re-exported by the
// `export * from './color'` at the bottom of this file, alongside the tokens and
// the stylesheet factory.

interface ThemeState {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
  hydrateTheme: () => Promise<void>;
}

/** Resolves `system` against the OS appearance, defaulting to dark. */
function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'system') return Appearance.getColorScheme() !== 'light';
  return mode === 'dark';
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'dark',
  colors: darkTheme,
  isDark: true,

  setMode: async (mode: ThemeMode) => {
    const isDark = resolveIsDark(mode);
    await AsyncStorage.setItem('ulmara_theme_mode', mode);
    set({ mode, isDark, colors: isDark ? darkTheme : lightTheme });
  },

  hydrateTheme: async () => {
    const saved = (await AsyncStorage.getItem('ulmara_theme_mode')) as ThemeMode | null;
    const mode: ThemeMode = saved ?? 'dark';
    const isDark = resolveIsDark(mode);
    set({ mode, isDark, colors: isDark ? darkTheme : lightTheme });
  },
}));

export * from './tokens';
export * from './styles';
export * from './color';
