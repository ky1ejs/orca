import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('orca', {
  platform: process.platform,
});
