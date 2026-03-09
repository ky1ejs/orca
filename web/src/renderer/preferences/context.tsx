import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type ColorScheme = 'system' | 'light' | 'dark';

interface PreferencesContextValue {
  terminalFontFamily: string;
  setTerminalFontFamily: (font: string) => Promise<void>;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const TERMINAL_FONT_FAMILY_KEY = 'terminal.fontFamily';
const COLOR_SCHEME_KEY = 'appearance.colorScheme';
const DEFAULT_FONT = 'monospace';

/** Apply the color scheme to the document root element. */
function applyColorScheme(scheme: ColorScheme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  if (scheme === 'light' || scheme === 'dark') {
    root.classList.add(scheme);
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [terminalFontFamily, setTerminalFontFamilyState] = useState(DEFAULT_FONT);
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>('system');

  useEffect(() => {
    if (!window.orca?.settings) return;
    window.orca.settings.getAll().then((settings) => {
      const font = settings[TERMINAL_FONT_FAMILY_KEY];
      if (typeof font === 'string') {
        setTerminalFontFamilyState(font);
      }
      const scheme = settings[COLOR_SCHEME_KEY];
      if (scheme === 'light' || scheme === 'dark' || scheme === 'system') {
        setColorSchemeState(scheme);
        applyColorScheme(scheme);
      }
    });
  }, []);

  const setTerminalFontFamily = useCallback(async (font: string) => {
    const value = font.trim() || DEFAULT_FONT;
    setTerminalFontFamilyState(value);
    if (window.orca?.settings) {
      await window.orca.settings.set(TERMINAL_FONT_FAMILY_KEY, value);
    }
  }, []);

  const setColorScheme = useCallback(async (scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    applyColorScheme(scheme);
    if (window.orca?.settings) {
      await window.orca.settings.set(COLOR_SCHEME_KEY, scheme);
    }
  }, []);

  return (
    <PreferencesContext.Provider
      value={{ terminalFontFamily, setTerminalFontFamily, colorScheme, setColorScheme }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
