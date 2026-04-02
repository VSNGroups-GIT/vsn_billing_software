import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { PrintableQuotation } from "@/components/printable-quotation";
import { ConvertQuotationButton } from "@/components/convert-quotation-button";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-800" },
  recorded: { label: "Recorded", className: "bg-blue-100 text-blue-800" },
  converted: { label: "Converted", className: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800" },
};

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quotation } = await supabase
    .from("quotations")
    .select(`
      *,
      clients (
        name,
        email,
        phone,
        address,
        city,
        state,
        zip_code
      ),
      quotation_items (*)
    `)
    .eq("id", id)
    .single();

  if (!quotation) {
    notFound();
  }

  let template = null;
  if (quotation.organization_id) {
    const { data: templateData } = await supabase
      .from("invoice_templates")
      .select("*")
      .eq("organization_id", quotation.organization_id)
      .single();

    template = templateData;
  }

  const cfg = statusConfig[quotation.status] || { label: quotation.status, className: "" };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/quotations">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Quotation: {quotation.quotation_number}</h1>
          <Badge className={cfg.className}>{cfg.label}</Badge>
          {quotation.status === "converted" && (
            <span className="text-sm font-medium text-green-700">Converted to invoice</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {quotation.status !== "converted" ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/quotations/${quotation.id}/edit`}>Edit Quotation</Link>
              </Button>
              <ConvertQuotationButton quotationId={quotation.id} />
            </>
          ) : (
            quotation.converted_invoice_id && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/invoices/${quotation.converted_invoice_id}`}>
                  View Converted Invoice
                </Link>
              </Button>
            )
          )}
        </div>
      </div>

      <PrintableQuotation quotation={quotation} template={template} />
    </div>
  );
}
