import { useColorScheme } from 'react-native';

const light = {
  bg: '#eceeea',
  surface: '#f8f9f6',
  text: '#171b26',
  muted: '#59606e',
  line: '#cfd3cc',
  accent: '#1f3f8f',
  onAccent: '#ffffff',
  gold: '#a87e12',
  good: '#2f7d4f',
  bad: '#b23a3a',
};

const dark: typeof light = {
  bg: '#0e1220',
  surface: '#161b2c',
  text: '#e8e9ee',
  muted: '#9aa1b4',
  line: '#2a3147',
  accent: '#93abf2',
  onAccent: '#0e1220',
  gold: '#e2b94c',
  good: '#6fcf97',
  bad: '#f08a8a',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Eine Farbe pro Leitner-Fach, von „neu“ bis „sitzt“. */
export function boxColor(c: Colors, box: number) {
  return [c.bad, c.bad, c.gold, c.gold, c.accent, c.good][box] ?? c.muted;
}
