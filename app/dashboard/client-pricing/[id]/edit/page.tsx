import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { ClientPricingForm } from "@/components/client-pricing-form"

export default async function EditClientPricingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

  if (profile?.role !== "super_admin") {
    redirect("/dashboard")
  }

  // Get the pricing rule
  const { data: pricingRule, error } = await supabase.from("client_product_pricing").select("*").eq("id", id).single()

  if (error || !pricingRule) {
    notFound()
  }

  // Load all pricing rules for this client so the edit screen is a client-level bulk editor.
  const { data: clientPricingRules, error: clientPricingRulesError } = await supabase
    .from("client_product_pricing")
    .select("*")
    .eq("client_id", pricingRule.client_id)
    .order("product_id")

  if (clientPricingRulesError) {
    // If we fail to load the rest, fail fast rather than showing an incomplete editor.
    notFound()
  }

  // Get clients, products, and pricing data for the form
  const [clientsResult, productsResult] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("products").select("id, name, paper_price").eq("is_active", true).order("name"),
  ])

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Edit Client Pricing Rules</h1>
        <p className="text-muted-foreground mt-1">Update custom pricing for all products for this client</p>
      </div>

      <div className="max-w-3xl">
        <ClientPricingForm
          clients={clientsResult.data || []}
          products={productsResult.data || []}
          existingRules={clientPricingRules || []}
        />
      </div>
    </div>
  )
}
