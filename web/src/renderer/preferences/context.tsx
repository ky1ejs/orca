import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';

export type ColorScheme = 'system' | 'light' | 'dark';
type AgentLaunchMode = 'terminal' | 'plan';

interface PreferencesContextValue {
  terminalFontFamily: string;
  setTerminalFontFamily: (font: string) => Promise<void>;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => Promise<void>;
  agentLaunchMode: AgentLaunchMode;
  setAgentLaunchMode: (mode: AgentLaunchMode) => Promise<void>;
  terminalPanelHeight: number;
  setTerminalPanelHeight: (height: number) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const TERMINAL_FONT_FAMILY_KEY = 'terminal.fontFamily';
const COLOR_SCHEME_KEY = 'appearance.colorScheme';
const AGENT_LAUNCH_MODE_KEY = 'agent.launchMode';
const TERMINAL_PANEL_HEIGHT_KEY = 'ui.terminalPanelHeight';
const DEFAULT_FONT = 'monospace';
const DEFAULT_TERMINAL_HEIGHT = 320;

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
  const [agentLaunchMode, setAgentLaunchModeState] = useState<AgentLaunchMode>('terminal');
  const [terminalPanelHeight, setTerminalPanelHeightState] = useState(DEFAULT_TERMINAL_HEIGHT);

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
      const launchMode = settings[AGENT_LAUNCH_MODE_KEY];
      if (launchMode === 'terminal' || launchMode === 'plan') {
        setAgentLaunchModeState(launchMode);
      }
      const height = settings[TERMINAL_PANEL_HEIGHT_KEY];
      if (typeof height === 'number' && height > 0) {
        setTerminalPanelHeightState(height);
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

  const setAgentLaunchMode = useCallback(
    async (mode: AgentLaunchMode) => {
      if (mode === agentLaunchMode) return;
      setAgentLaunchModeState(mode);
      if (window.orca?.settings) {
        await window.orca.settings.set(AGENT_LAUNCH_MODE_KEY, mode);
      }
    },
    [agentLaunchMode],
  );

  const persistHeightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (persistHeightTimer.current) clearTimeout(persistHeightTimer.current);
    };
  }, []);
  const setTerminalPanelHeight = useCallback((height: number) => {
    setTerminalPanelHeightState(height);
    if (persistHeightTimer.current) clearTimeout(persistHeightTimer.current);
    persistHeightTimer.current = setTimeout(() => {
      if (window.orca?.settings) {
        window.orca.settings.set(TERMINAL_PANEL_HEIGHT_KEY, height).catch(() => {});
      }
    }, 300);
  }, []);

  return (
    <PreferencesContext.Provider
      value={{
        terminalFontFamily,
        setTerminalFontFamily,
        colorScheme,
        setColorScheme,
        agentLaunchMode,
        setAgentLaunchMode,
        terminalPanelHeight,
        setTerminalPanelHeight,
      }}
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
