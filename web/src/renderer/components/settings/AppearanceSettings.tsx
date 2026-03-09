import { Monitor, Sun, Moon } from 'lucide-react';
import { usePreferences, type ColorScheme } from '../../preferences/context.js';

const options: { value: ColorScheme; title: string; subtitle: string; Icon: typeof Monitor }[] = [
  {
    value: 'system',
    title: 'System',
    subtitle: 'Automatically match your operating system setting',
    Icon: Monitor,
  },
  {
    value: 'light',
    title: 'Light',
    subtitle: 'Optimized for bright environments',
    Icon: Sun,
  },
  {
    value: 'dark',
    title: 'Dark',
    subtitle: 'Reduced glare for low-light environments',
    Icon: Moon,
  },
];

export function AppearanceSettings() {
  const { colorScheme, setColorScheme } = usePreferences();

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-label-md text-fg-muted mb-1">Theme</label>
        <p className="text-label-sm text-fg-faint mb-3">
          Choose how Orca looks. Select a theme or let it follow your system preference.
        </p>
      </div>
      <div className="space-y-2">
        {options.map(({ value, title, subtitle, Icon }) => {
          const selected = colorScheme === value;
          return (
            <button
              key={value}
              onClick={() => setColorScheme(value)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded border transition-colors text-left ${
                selected
                  ? 'border-fg bg-surface-inset'
                  : 'border-edge-subtle bg-surface-raised hover:bg-surface-hover'
              }`}
            >
              <Icon className={`h-5 w-5 flex-shrink-0 ${selected ? 'text-fg' : 'text-fg-faint'}`} />
              <div className="min-w-0">
                <div
                  className={`text-label-md ${selected ? 'text-fg font-medium' : 'text-fg-muted'}`}
                >
                  {title}
                </div>
                <div className="text-label-sm text-fg-faint">{subtitle}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
