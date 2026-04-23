import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const computeDueDate = (
  issueDate: string,
  days: number | null | undefined,
) => {
  const base = issueDate ? new Date(issueDate) : new Date();
  const increment = Number.isFinite(days ?? null) ? Number(days ?? 0) : 0;
  base.setDate(base.getDate() + increment);
  return base.toISOString().split("T")[0];
};

const computeDueDateByType = (
  issueDate: string,
  daysType: string | null | undefined,
  days: number | null | undefined,
) => {
  if (daysType === "end_of_month") {
    const base = issueDate ? new Date(issueDate) : new Date();
    const extraMonths = Number.isFinite(days ?? null) ? Number(days ?? 0) : 0;
    base.setMonth(base.getMonth() + extraMonths + 1, 0);
    return base.toISOString().split("T")[0];
  }

  return computeDueDate(issueDate, days);
};

export async function POST(request: Request) {
  try {
    const { quotationId } = (await request.json()) as { quotationId?: string };
    if (!quotationId) {
      return NextResponse.json({ error: "quotationId is required" }, { status: 400 });
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: quotation, error: quotationError } = await supabase
      .from("quotations")
      .select("*")
      .eq("id", quotationId)
      .single();

    if (quotationError || !quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    const { data: client } = await supabase
      .from("clients")
      .select("due_days, due_days_type")
      .eq("id", quotation.client_id)
      .maybeSingle();

    const clientDueDays = Number(client?.due_days ?? 30);
    const clientDueDaysType = client?.due_days_type ?? "fixed_days";
    const invoiceDueDate = computeDueDateByType(
      quotation.issue_date,
      clientDueDaysType,
      clientDueDays,
    );

    if (quotation.converted_invoice_id || quotation.status === "converted") {
      return NextResponse.json({ error: "Quotation already converted" }, { status: 400 });
    }

    const { data: quoteItems, error: itemsError } = await supabase
      .from("quotation_items")
      .select("*")
      .eq("quotation_id", quotationId);

    if (itemsError || !quoteItems || quoteItems.length === 0) {
      return NextResponse.json({ error: "Quotation has no items" }, { status: 400 });
    }

    const { data: generatedInvoiceNumber, error: generateNumberError } =
      await supabase.rpc("next_document_number", {
        p_doc_type: "invoice",
      });

    if (generateNumberError || !generatedInvoiceNumber) {
      return NextResponse.json(
        { error: "Failed to generate invoice number" },
        { status: 400 },
      );
    }

    const invoiceNumber = String(generatedInvoiceNumber);
    const roundedInvoiceTotal = Math.round(Number(quotation.total_amount || 0));

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        reference_number: `Q-${quotation.quotation_number}`,
        client_id: quotation.client_id,
        issue_date: quotation.issue_date,
        due_date: invoiceDueDate,
        due_days_type: clientDueDaysType,
        status: "recorded",
        subtotal: quotation.subtotal,
        tax_amount: 0,
        discount_amount: 0,
        total_amount: roundedInvoiceTotal,
        amount_paid: 0,
        total_birds: 0,
        notes: quotation.notes,
        created_by: user.id,
        organization_id: quotation.organization_id,
      })
      .select("id")
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: "Failed to create invoice" }, { status: 400 });
    }

    const mappedItems = quoteItems.map((item) => ({
      invoice_id: invoice.id,
      product_id: item.product_id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_rate: 0,
      discount: 0,
      line_total: item.line_total,
      bird_count: null,
      per_bird_adjustment: null,
    }));

    const { error: insertItemsError } = await supabase
      .from("invoice_items")
      .insert(mappedItems);

    if (insertItemsError) {
      return NextResponse.json({ error: "Failed to create invoice items" }, { status: 400 });
    }

    const { error: updateQuotationError } = await supabase
      .from("quotations")
      .update({
        status: "converted",
        converted_invoice_id: invoice.id,
        converted_at: new Date().toISOString(),
      })
      .eq("id", quotationId);

    if (updateQuotationError) {
      return NextResponse.json({ error: "Failed to update quotation conversion state" }, { status: 400 });
    }

    const { error: clientPromotionError } = await supabase
      .from("clients")
      .update({ client_record_type: "permanent" })
      .eq("id", quotation.client_id)
      .eq("client_record_type", "temporary");

    if (clientPromotionError) {
      return NextResponse.json({ error: "Invoice created but failed to update client record type" }, { status: 400 });
    }

    return NextResponse.json({ success: true, invoiceId: invoice.id });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
