export function AppLoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-panel">
        <div className="loading-spinner" />
        <div className="space-y-1">
          <p className="eyebrow-label">Adzone Workspace</p>
          <h1 className="text-xl font-bold text-zinc-950">Preparing your dashboard</h1>
          <p className="text-sm text-zinc-500">Loading your latest business data and workspace settings.</p>
        </div>
      </div>
    </div>
  );
}
