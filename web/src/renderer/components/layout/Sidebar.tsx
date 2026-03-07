export function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-white">Orca</h2>
      </div>
      <nav className="flex-1 p-2">
        <div className="px-3 py-2 text-sm text-gray-500">No projects yet</div>
      </nav>
    </aside>
  );
}
