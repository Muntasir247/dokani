import { NextRequest, NextResponse } from "next/server";
import { generateInternalEAN13, generateSKU } from "@/lib/barcodes";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "ean13";
  const prefix = searchParams.get("prefix") || "200";
  const categoryCode = searchParams.get("categoryCode");

  if (type === "sku") {
    const sku = generateSKU(prefix, categoryCode || undefined);
    return NextResponse.json({ sku });
  }

  const barcode = generateInternalEAN13(prefix);
  return NextResponse.json({ barcode, format: "EAN-13" });
}
