import { createClient } from "@/lib/supabase/server";
import { InvoiceForm } from "@/components/invoice-form";

export default async function NewInvoicePage() {
  const supabase = await createClient();

  // Fetch clients, products and client-specific pricing rules
  const [clientsResult, productsResult, pricingRulesResult, latestInvoiceResult] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, email, due_days, due_days_type")
      .order("name"),
    supabase.from("products").select("*").eq("is_active", true).order("name"),
    supabase
      .from("client_product_pricing")
      .select(
        "product_id, price_rule_type, price_rule_value, price_category_id, fixed_base_value, client_id, conditional_threshold, conditional_discount_below, conditional_discount_above_equal",
      ),
    supabase
      .from("invoices")
      .select("invoice_number")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Create Invoice</h1>
        <p className="text-muted-foreground mt-1">
          Generate a new invoice for a client
        </p>
      </div>

      <InvoiceForm
        clients={clientsResult.data || []}
        products={productsResult.data || []}
        clientPricingRules={pricingRulesResult.data || []}
        lastInvoiceNumber={latestInvoiceResult.data?.invoice_number || null}
      />
    </div>
  );
}
