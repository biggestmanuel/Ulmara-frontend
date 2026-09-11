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
  primary: '#0F766E',
  primaryHover: '#0B5F59',
  primaryPressed: '#094C48',
  primaryLight: '#CCFBF1',
  primarySoft: '#F0FDFA',
  background: '#F7FAFA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#102A2A',
  textSecondary: '#4B6665',
  textMuted: '#7A9290',
  border: '#D7E5E3',
  divider: '#E6F0EF',
  success: '#16845B',
  warning: '#B7791F',
  error: '#C24141',
  info: '#287A9A',
};

export const darkTheme: ThemeColors = {
  primary: '#14B8A6',
  primaryHover: '#2DD4BF',
  primaryPressed: '#0F9D8F',
  primaryLight: '#153F3B',
  primarySoft: '#12322F',
  background: '#0B1618',
  surface: '#122124',
  surfaceElevated: '#173034',
  textPrimary: '#ECFDFB',
  textSecondary: '#A7C4C1',
  textMuted: '#77918E',
  border: '#244044',
  divider: '#1B3336',
  success: '#22C55E',
  warning: '#EAB308',
  error: '#F87171',
  info: '#60A5FA',
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