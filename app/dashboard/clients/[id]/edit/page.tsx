import { createClient } from "@/lib/supabase/server"
import { ClientForm } from "@/components/client-form"
import { notFound, redirect } from "next/navigation"

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role === "accountant") {
    redirect("/dashboard/gst-filings")
  }

  const { data: client } = await supabase.from("clients").select("*").eq("id", id).single()

  if (!client) {
    notFound()
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Edit Client</h1>
        <p className="text-muted-foreground mt-1">Update client information</p>
      </div>

      <div className="max-w-2xl">
        <ClientForm client={client} />
      </div>
    </div>
  )
}
