import { createClient } from "@/lib/supabase/server";
import { QuotationForm } from "@/components/quotation-form";

export default async function NewQuotationPage() {
  const supabase = await createClient();

  const [clientsResult, productsResult, pricingRulesResult, latestQuotationResult] = await Promise.all([
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
    supabase
      .from("quotations")
      .select("quotation_number")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Create Quotation</h1>
        <p className="text-muted-foreground mt-1">
          Generate a new quotation for a client
        </p>
      </div>

      <QuotationForm
        clients={clientsResult.data || []}
        products={productsResult.data || []}
        clientPricingRules={pricingRulesResult.data || []}
        lastQuotationNumber={latestQuotationResult.data?.quotation_number || null}
      />
    </div>
  );
}
