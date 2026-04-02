import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { QuotationForm } from "@/components/quotation-form";

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quotation } = await supabase
    .from("quotations")
    .select("*")
    .eq("id", id)
    .single();

  if (!quotation) notFound();

  const [itemsResult, clientsResult, productsResult, pricingRulesResult] = await Promise.all([
    supabase.from("quotation_items").select("*").eq("quotation_id", id),
    supabase
      .from("clients")
      .select("id, name, email, due_days, due_days_type")
      .order("name"),
    supabase.from("products").select("*").eq("is_active", true).order("name"),
    supabase
      .from("client_product_pricing")
      .select(
        "product_id, client_id, price_rule_type, price_rule_value, fixed_base_value, conditional_threshold, conditional_discount_below, conditional_discount_above_equal",
      ),
  ]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Edit Quotation</h1>
        <p className="text-muted-foreground mt-1">Update quotation details and line items</p>
      </div>

      <QuotationForm
        clients={clientsResult.data || []}
        products={productsResult.data || []}
        clientPricingRules={pricingRulesResult.data || []}
        initialQuotation={{
          id: quotation.id,
          client_id: quotation.client_id,
          quotation_number: quotation.quotation_number,
          reference_number: quotation.reference_number,
          quotation_type: quotation.quotation_type,
          issue_date: quotation.issue_date,
          due_date: quotation.due_date,
          notes: quotation.notes,
          status: quotation.status,
        }}
        initialItems={(itemsResult.data || []).map((it: any) => ({
          product_id: it.product_id,
          description: it.description,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          line_total: Number(it.line_total),
        }))}
      />
    </div>
  );
}
