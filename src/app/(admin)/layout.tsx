import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ShieldCheck, ArrowLeft } from "lucide-react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = (await supabase
    .from("profiles")
    .select("is_super_admin, full_name")
    .eq("id", user.id)
    .single()) as { data: { is_super_admin: boolean; full_name: string } | null };

  if (!profile?.is_super_admin) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-slate-100">
        <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 border border-slate-700 text-center shadow-2xl">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 text-red-400 font-bold text-2xl mb-4">
            !
          </div>
          <h1 className="text-xl font-extrabold text-white">Super Admin Access Denied</h1>
          <p className="text-sm text-slate-400 mt-2">
            Your user account ({user.email}) does not have internal platform administration privileges.
          </p>
          <div className="mt-6">
            <Link
              href="/pos"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-500"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to POS Counter
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white font-extrabold text-sm shadow">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white">Dokani</span>
              <span className="text-xs text-red-400 font-bold ml-2 uppercase tracking-wider bg-red-950/80 px-2 py-0.5 rounded border border-red-800/60">
                Super Admin
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>{profile.full_name}</span>
            <Link
              href="/pos"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Exit to POS
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6 sm:p-8">{children}</main>
    </div>
  );
}
