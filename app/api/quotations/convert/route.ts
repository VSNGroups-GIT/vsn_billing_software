import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const sanitizeInvoiceNumberInput = (value: string) =>
  value.replace(/[^A-Za-z0-9-]/g, "");

const getNextInvoiceNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "INV-0001";

  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return `${sanitizeInvoiceNumberInput(trimmed)}-001`;

  const prefix = match[1];
  const numericPart = match[2];
  const nextValue = (Number(numericPart) + 1)
    .toString()
    .padStart(numericPart.length, "0");

  return sanitizeInvoiceNumberInput(`${prefix}${nextValue}`);
};

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

    const { data: latestInvoice } = await supabase
      .from("invoices")
      .select("invoice_number")
      .eq("organization_id", quotation.organization_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const invoiceNumber = latestInvoice?.invoice_number
      ? getNextInvoiceNumber(latestInvoice.invoice_number)
      : "INV-0001";

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
        total_amount: quotation.total_amount,
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
