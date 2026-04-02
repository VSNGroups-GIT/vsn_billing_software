import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PrintableInvoice } from "@/components/printable-invoice";
import { Notes } from "@/components/notes";

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
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    userRole = profile?.role;

    if (profile?.organization_id) {
      const { data: templateData } = await supabase
        .from("invoice_templates")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .single();

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
      <PrintableInvoice invoice={invoice} template={template} />
      <Notes
        notes={invoiceNotes || []}
        referenceId={id}
        referenceType="invoice"
        userRole={userRole}
      />
    </div>
  );
}
