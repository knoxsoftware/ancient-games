import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  /**
   * When true, renders as a fixed overlay (top-right corner).
   * When false, renders inline (for use inside a flex row).
   */
  fixed?: boolean;
}

export default function ThemeToggle({ fixed = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isYahoo = theme === 'yahoo';

  const button = (
    <button
      onClick={toggleTheme}
      title={isYahoo ? 'Switch to dark mode' : 'Switch to Yahoo Games classic mode'}
      style={{
        fontFamily: isYahoo ? 'Arial, Helvetica, sans-serif' : undefined,
        fontSize: '12px',
        padding: '3px 8px',
        border: isYahoo ? '1px solid #999999' : '1px solid rgba(196,168,107,0.4)',
        borderRadius: isYahoo ? '0' : '6px',
        background: isYahoo ? '#dddddd' : 'rgba(196,168,107,0.1)',
        color: isYahoo ? '#000000' : '#C4A030',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        lineHeight: '1.4',
      }}
    >
      {isYahoo ? '🌙 Dark' : '☀ Classic'}
    </button>
  );

  if (!fixed) return button;

  return (
    <div style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 50 }}>
      {button}
    </div>
  );
}
