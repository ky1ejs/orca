import { useState, useCallback, type FormEvent } from 'react';
import { usePreferences } from '../../preferences/context.js';

export function TerminalSettings() {
  const { terminalFontFamily, setTerminalFontFamily } = usePreferences();
  const [fontInput, setFontInput] = useState(terminalFontFamily);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

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
        <label className="block text-sm text-gray-300 mb-1">Font Family</label>
        <input
          type="text"
          value={fontInput}
          onChange={(e) => setFontInput(e.target.value)}
          placeholder="monospace"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <p className="text-xs text-gray-500 mt-1">
          The font must be installed on your system. Examples: &quot;MesloLGS NF&quot;,
          &quot;JetBrains Mono&quot;, &quot;Fira Code&quot;.
        </p>
      </div>

      {success && <p className="text-sm text-green-400">Saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
