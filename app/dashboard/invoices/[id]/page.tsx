import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintableInvoice } from "@/components/printable-invoice";
import { Notes } from "@/components/notes";
import { DocumentShareActions } from "@/components/document-share-actions";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch invoice with all related data
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      `
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
      invoice_items (
        description,
        quantity,
        unit_price,
        tax_rate,
        discount,
        line_total,
        bird_count,
        per_bird_adjustment
      )
    `,
    )
    .eq("id", id)
    .single();

  if (!invoice) {
    notFound();
  }

  // Fetch invoice template settings
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let template = null;
  let userRole = null;
  let organizationTaxId: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    userRole = profile?.role;

    if (profile?.organization_id) {
      const { data: organization } = await supabase
        .from("organizations")
        .select("tax_id")
        .eq("id", profile.organization_id)
        .maybeSingle();

      organizationTaxId = organization?.tax_id || null;

      const { data: templateData } = await supabase
        .from("invoice_templates")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .eq("template_type", "invoice")
        .maybeSingle();

      template = templateData;
    }
  }

  // Fetch invoice notes
  const { data: invoiceNotesData } = await supabase
    .from("invoice_notes")
    .select(
      `
      id,
      note,
      created_at,
      created_by,
      created_by_profile:profiles!created_by (
        full_name,
        role
      )
    `,
    )
    .eq("invoice_id", id)
    .order("created_at", { ascending: false });

  // Filter out notes with null profiles
  const invoiceNotes =
    (invoiceNotesData || [])
      .filter((note: any) => note.created_by_profile !== null)
      .map((note: any) => ({
        id: note.id,
        note: note.note,
        created_at: note.created_at,
        profiles: note.created_by_profile,
      })) || [];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/invoices">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Link>
            </Button>
            <h1 className="text-xl font-bold sm:text-2xl">Invoice: {invoice.invoice_number}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <DocumentShareActions documentType="invoice" documentId={invoice.id} />
          </div>
        </div>
      </div>

      <PrintableInvoice invoice={invoice} template={template} organizationTaxId={organizationTaxId} />
      <Notes
        notes={invoiceNotes || []}
        referenceId={id}
        referenceType="invoice"
        userRole={userRole}
      />
    </div>
  );
}
