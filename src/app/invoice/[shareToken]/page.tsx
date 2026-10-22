import { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";
import { InvoiceViewerClient, PublicInvoiceData } from "./invoice-viewer-client";

interface PageProps {
  params: Promise<{ shareToken: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shareToken } = await params;
  return {
    title: `Invoice #${shareToken.slice(0, 8).toUpperCase()} | Dokani`,
    description: "Digital verified invoice and warranty receipt",
  };
}

export default async function PublicInvoicePage({ params }: PageProps) {
  const { shareToken } = await params;

  if (!shareToken || shareToken.trim().length < 8) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await callRpc<{ found: boolean } & PublicInvoiceData>(
    supabase,
    "fn_get_public_invoice",
    {
      p_share_token: shareToken.trim(),
    }
  );

  if (error || !data || !data.found) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-800">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-50 text-rose-600 mb-4 font-bold text-2xl">
            !
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 mb-2">Invoice Not Found</h1>
          <p className="text-sm text-slate-500 mb-6">
            The invoice link you followed may be invalid, expired, or removed. Please verify the URL or contact the merchant.
          </p>
          <div className="text-xs text-slate-400">Powered by Dokani POS</div>
        </div>
      </div>
    );
  }

  return (
    <InvoiceViewerClient
      invoice={data}
      initialFormat={data.store.default_paper_size === "a4" ? "a4" : "80mm"}
    />
  );
}
