export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold text-xl">
          দ
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dokani (দোকানী)</h1>
        <p className="mt-2 text-sm text-slate-600">
          Multi-tenant, offline-first Point-of-Sale & inventory SaaS for retail businesses in Bangladesh.
        </p>
        <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 font-mono">
          Core Schema & Database Layer Initialized
        </div>
      </div>
    </main>
  );
}
