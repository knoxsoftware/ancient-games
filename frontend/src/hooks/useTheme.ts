import { useEffect, useState } from 'react';
import { getTheme, type Theme } from '../services/theme';

export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(getTheme);

  useEffect(() => {
    const handler = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener('themechange', handler);
    return () => window.removeEventListener('themechange', handler);
  }, []);

  return theme;
}
