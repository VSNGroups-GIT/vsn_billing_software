import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import { ClientPricingPageClient } from "./client-pricing-page-client"
import { DashboardPageWrapper } from "@/components/dashboard-page-wrapper"
import { Suspense } from "react"
import { LoadingOverlay } from "@/components/loading-overlay"

export default async function ClientPricingPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Check role (super_admin full, admin view-only)
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

  if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) {
    redirect("/dashboard")
  }

  // Get all clients
  const { data: clients } = await supabase.from("clients").select("id, name").order("name", { ascending: true })

  // Get all pricing rules with client, product, and category details
  const { data: pricingRules } = await supabase
    .from("client_product_pricing")
    .select(
      `
      *,
      clients(name),
      products(name, paper_price)
    `,
    )
    .order("created_at", { ascending: false })

  return (
    <DashboardPageWrapper title="Client-Specific Pricing">
      <div className="w-full p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
          {profile.role === "super_admin" && (
            <Button asChild className="w-full sm:w-auto">
              <Link href="/dashboard/client-pricing/new">
                <Plus className="h-4 w-4 mr-2" />
                Add Pricing Rule
              </Link>
            </Button>
          )}
        </div>

        <Suspense fallback={<LoadingOverlay />}>
          <ClientPricingPageClient
            pricingRules={pricingRules || []}
            clients={clients || []}
            userRole={profile.role}
          />
        </Suspense>
      </div>
    </DashboardPageWrapper>
  )
}
