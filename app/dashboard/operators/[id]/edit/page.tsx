import { createClient } from "@/lib/supabase/server"
import { OperatorForm } from "@/components/operator-form"
import { notFound } from "next/navigation"

export default async function EditOperatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: operator } = await supabase.from("operators").select("*").eq("id", id).single()

  if (!operator) {
    notFound()
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Edit Operator</h1>
        <p className="text-muted-foreground mt-1">Update operator information</p>
      </div>

      <div className="max-w-2xl">
        <OperatorForm operator={operator} />
      </div>
    </div>
  )
}
