import { app, Menu, dialog } from 'electron';

const isMac = process.platform === 'darwin';
const isDev = process.env.NODE_ENV === 'development';

let currentOnClick: (() => void) | null = null;

export function initAppMenu(options: { onCheckForUpdates: () => void }): void {
  currentOnClick = options.onCheckForUpdates;
  buildMenu('Check for Updates...', true);
}

export function setCheckForUpdatesState(label: string, enabled: boolean): void {
  buildMenu(label, enabled);
}

function buildMenu(checkForUpdatesLabel: string, checkForUpdatesEnabled: boolean): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: checkForUpdatesLabel,
                enabled: checkForUpdatesEnabled,
                click: () => {
                  if (isDev) {
                    dialog.showMessageBox({
                      type: 'info',
                      title: 'Updates',
                      message: 'Not available in development',
                      detail: 'Auto-updates are only available in production builds.',
                    });
                    return;
                  }
                  currentOnClick?.();
                },
              },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        ...(isDev ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }] : []),
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ role: 'close' as const }] : []),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
