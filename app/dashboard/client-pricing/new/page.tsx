import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ClientPricingForm } from "@/components/client-pricing-form"

export default async function NewClientPricingPage() {
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

  // Get clients and products for the form
  const [clientsResult, productsResult] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("products").select("id, name, paper_price").eq("is_active", true).order("name"),
  ])

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Add Client Pricing Rule</h1>
        <p className="text-muted-foreground mt-1">Set custom pricing for a client-product combination</p>
      </div>

      <div className="max-w-3xl">
        <ClientPricingForm
          clients={clientsResult.data || []}
          products={productsResult.data || []}
        />
      </div>
    </div>
  )
}
