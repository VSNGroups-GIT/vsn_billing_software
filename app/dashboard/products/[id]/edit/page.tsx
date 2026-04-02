import { createClient } from "@/lib/supabase/server"
import { ProductForm } from "@/components/product-form"
import { notFound } from "next/navigation"

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: product }, { data: operators }] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).single(),
    supabase.from("operators").select("id, name, is_active").order("name"),
  ])

  if (!product) {
    notFound()
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Edit Product</h1>
        <p className="text-muted-foreground mt-1">Update product information</p>
      </div>

      <div className="max-w-2xl">
        <ProductForm product={product} operators={operators || []} />
      </div>
    </div>
  )
}
