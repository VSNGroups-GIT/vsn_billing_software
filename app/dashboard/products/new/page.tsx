import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ProductForm } from "@/components/product-form"

export default async function NewProductPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const [{ data: profile }, { data: operators }] = await Promise.all([
    supabase.from("profiles").select("role, organization_id").eq("id", user.id).single(),
    supabase.from("operators").select("id, name, is_active").order("name"),
  ])

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Add New Product</h1>
        <p className="text-muted-foreground mt-1">Create a new product or service</p>
      </div>

      <div className="max-w-2xl">
        <ProductForm operators={operators || []} userRole={profile?.role} />
      </div>
    </div>
  )
}
