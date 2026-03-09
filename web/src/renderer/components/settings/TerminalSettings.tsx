import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { usePreferences } from '../../preferences/context.js';

export function TerminalSettings() {
  const { terminalFontFamily, setTerminalFontFamily } = usePreferences();
  const [fontInput, setFontInput] = useState(terminalFontFamily);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!window.orca?.fonts) return;
    window.orca.fonts.list().then(setSystemFonts);
  }, []);

  const handleSave = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setSuccess(false);
      await setTerminalFontFamily(fontInput);
      setSaving(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    },
    [fontInput, setTerminalFontFamily],
  );

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label htmlFor="font-family" className="block text-sm text-fg-muted mb-1">
          Font Family
        </label>
        <input
          id="font-family"
          type="text"
          list="system-fonts"
          value={fontInput}
          onChange={(e) => setFontInput(e.target.value)}
          placeholder="monospace"
          className="w-full px-3 py-2 bg-surface-inset border border-edge-subtle rounded text-sm text-fg placeholder-fg-faint focus:outline-none focus:border-edge-subtle"
        />
        <datalist id="system-fonts">
          {systemFonts.map((font) => (
            <option key={font} value={font} />
          ))}
        </datalist>
        <p className="text-xs text-fg-faint mt-1">
          Select a font installed on your system or type a custom name.
        </p>
      </div>

      {success && <p className="text-sm text-success">Saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent text-sm rounded transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
