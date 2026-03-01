const STORAGE_KEY = 'theme';
const EGYPTIAN = 'egyptian';

export type Theme = 'classic' | 'egyptian';

function applyTheme(theme: Theme) {
  if (theme === EGYPTIAN) {
    document.documentElement.dataset.theme = EGYPTIAN;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

export function getTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'classic';
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === EGYPTIAN ? 'classic' : EGYPTIAN;
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
  return next;
}

// Apply immediately on module load (before React mounts)
applyTheme(getTheme());
