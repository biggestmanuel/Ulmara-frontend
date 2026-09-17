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
  primary: '#635BFF',
  primaryHover: '#554FE0',
  primaryPressed: '#4943C7',
  primaryLight: '#EDEBFF',
  primarySoft: '#F7F6FF',
  background: '#F7F8FC',
  surface: '#FFFFFF',
  surfaceElevated: '#F1F2F8',
  textPrimary: '#171827',
  textSecondary: '#4B4E64',
  textMuted: '#81859A',
  border: '#E4E6F0',
  divider: '#EEF0F6',
  success: '#16A34A',
  warning: '#D97706',
  error: '#DC2626',
  info: '#635BFF',
};

export const darkTheme: ThemeColors = {
  primary: '#8B84FF',
  primaryHover: '#A49FFF',
  primaryPressed: '#716AF0',
  primaryLight: '#282653',
  primarySoft: '#1D1C38',
  background: '#0D0F17',
  surface: '#151824',
  surfaceElevated: '#202438',
  textPrimary: '#F6F7FB',
  textSecondary: '#B8BBD0',
  textMuted: '#8589A1',
  border: '#2A2E43',
  divider: '#222638',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#A49FFF',
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