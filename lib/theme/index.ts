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
  primary: '#9B59B6',
  primaryHover: '#8E44AD',
  primaryPressed: '#7D3C98',
  primaryLight: '#F4ECF9',
  primarySoft: '#FAF5FD',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceElevated: '#F3F0F7',
  textPrimary: '#121212',
  textSecondary: '#4A4553',
  textMuted: '#7E778B',
  border: '#E8E3EE',
  divider: '#F0ECF4',
  success: '#16A34A',
  warning: '#D97706',
  error: '#DC2626',
  info: '#9333EA',
};

export const darkTheme: ThemeColors = {
  primary: '#9B59B6',
  primaryHover: '#AB69C6',
  primaryPressed: '#884EA0',
  primaryLight: '#2C1E38',
  primarySoft: '#1E1528',
  background: '#121212',
  surface: '#1C1A22',
  surfaceElevated: '#262330',
  textPrimary: '#FAFAFA',
  textSecondary: '#C4BFD2',
  textMuted: '#837D94',
  border: '#2E2A3A',
  divider: '#24202E',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#A855F7',
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