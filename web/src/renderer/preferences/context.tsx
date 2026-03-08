import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface PreferencesContextValue {
  terminalFontFamily: string;
  setTerminalFontFamily: (font: string) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const TERMINAL_FONT_FAMILY_KEY = 'terminal.fontFamily';
const DEFAULT_FONT = 'monospace';

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [terminalFontFamily, setTerminalFontFamilyState] = useState(DEFAULT_FONT);

  useEffect(() => {
    if (!window.orca?.preferences) return;
    window.orca.preferences.getAll().then((prefs) => {
      for (const pref of prefs) {
        if (pref.key === TERMINAL_FONT_FAMILY_KEY) {
          setTerminalFontFamilyState(pref.value);
        }
      }
    });
  }, []);

  const setTerminalFontFamily = useCallback(async (font: string) => {
    const value = font.trim() || DEFAULT_FONT;
    setTerminalFontFamilyState(value);
    if (window.orca?.preferences) {
      await window.orca.preferences.set(TERMINAL_FONT_FAMILY_KEY, value);
    }
  }, []);

  return (
    <PreferencesContext.Provider value={{ terminalFontFamily, setTerminalFontFamily }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
