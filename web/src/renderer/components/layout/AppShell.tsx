import { Sidebar } from './Sidebar.js';

export function AppShell() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Orca</h1>
          <p className="text-gray-400">Work management for AI agents</p>
        </div>
      </main>
    </div>
  );
}
