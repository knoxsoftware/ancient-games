import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'yahoo';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('ancient-games-theme');
    return stored === 'yahoo' ? 'yahoo' : 'dark';
  });

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'yahoo') {
      html.setAttribute('data-theme', 'yahoo');
    } else {
      html.removeAttribute('data-theme');
    }
    localStorage.setItem('ancient-games-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'yahoo' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
