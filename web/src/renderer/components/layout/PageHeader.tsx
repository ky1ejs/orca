import { Breadcrumbs } from './Breadcrumbs.js';
import { HeaderTerminalControls } from '../tasks/HeaderTerminalControls.js';
import { useTaskHeaderControls } from '../tasks/TaskHeaderContext.js';

export function PageHeader() {
  const controls = useTaskHeaderControls();

  return (
    <div className="shrink-0 flex items-center justify-between border-b border-edge-subtle">
      <div className="flex items-center gap-2">
        <Breadcrumbs />
        {controls && (
          <span className="text-fg-faint text-label-sm font-mono">{controls.displayId}</span>
        )}
      </div>
      <HeaderTerminalControls />
    </div>
  );
}
