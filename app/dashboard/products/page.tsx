import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import { ProductsTable } from "@/components/products-table"
import { DashboardPageWrapper } from "@/components/dashboard-page-wrapper"
import { Suspense } from "react"
import { LoadingOverlay } from "@/components/loading-overlay"
import { redirect } from "next/navigation"

async function ProductsContent() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get user's organization
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  if (!profile) {
    redirect("/dashboard")
  }

  const { data: products } = await supabase
    .from("products")
    .select("*, operators(name), profiles!products_created_by_fkey(full_name)")
    .eq("organization_id", profile.organization_id)
    .order("position", { ascending: true })

  return <ProductsTable products={products || []} />
}

export default async function ProductsPage() {
  return (
    <DashboardPageWrapper title="Products & Services">
      <div className="w-full p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
          <Button asChild className="w-full sm:w-auto">
            <Link href="/dashboard/products/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Link>
          </Button>
        </div>

        <Suspense fallback={<LoadingOverlay />}>
          <ProductsContent />
        </Suspense>
      </div>
    </DashboardPageWrapper>
  )
}
