import { create } from 'zustand';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light' | 'system';

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryPressed: string;
  primaryLight: string;
  primarySoft: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  divider: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export const lightTheme: ThemeColors = {
  primary: '#D65A31',
  primaryHover: '#BE4D29',
  primaryPressed: '#A84223',
  primaryLight: '#FBE5DD',
  primarySoft: '#FEF2ED',
  background: '#FAF9F7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#1D1917',
  textSecondary: '#665E59',
  textMuted: '#968C86',
  border: '#E6E0DC',
  divider: '#EEEAE7',
  success: '#269B68',
  warning: '#D89124',
  error: '#D95353',
  info: '#3978B8',
};

export const darkTheme: ThemeColors = {
  primary: '#F0784B',
  primaryHover: '#FF895B',
  primaryPressed: '#D96138',
  primaryLight: '#4A251B',
  primarySoft: '#351D17',
  background: '#100D0B',
  surface: '#191412',
  surfaceElevated: '#221B18',
  textPrimary: '#FAF5F2',
  textSecondary: '#B9ACA5',
  textMuted: '#81746D',
  border: '#332823',
  divider: '#29211D',
  success: '#3BC982',
  warning: '#E4A63A',
  error: '#F06B6B',
  info: '#5C9DE0',
};

interface ThemeState {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
  hydrateTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'dark',
  colors: darkTheme,
  isDark: true,

  setMode: async (mode: ThemeMode) => {
    let isDark = true;
    if (mode === 'system') {
      isDark = Appearance.getColorScheme() !== 'light';
    } else {
      isDark = mode === 'dark';
    }
    await AsyncStorage.setItem('ulmara_theme_mode', mode);
    set({ mode, isDark, colors: isDark ? darkTheme : lightTheme });
  },

  hydrateTheme: async () => {
    const saved = await AsyncStorage.getItem('ulmara_theme_mode');
    const mode = (saved as ThemeMode) || 'dark';
    let isDark = true;
    if (mode === 'system') {
      isDark = Appearance.getColorScheme() !== 'light';
    } else {
      isDark = mode === 'dark';
    }
    set({ mode, isDark, colors: isDark ? darkTheme : lightTheme });
  },
}));