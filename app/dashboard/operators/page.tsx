import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import { OperatorsTable } from "@/components/operators-table"
import { DashboardPageWrapper } from "@/components/dashboard-page-wrapper"
import { Suspense } from "react"
import { LoadingOverlay } from "@/components/loading-overlay"
import { redirect } from "next/navigation"

async function OperatorsContent() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  if (!profile?.organization_id) {
    redirect("/dashboard")
  }

  const { data: operators } = await supabase
    .from("operators")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })

  return <OperatorsTable operators={operators || []} />
}

export default async function OperatorsPage() {
  return (
    <DashboardPageWrapper title="Operators">
      <div className="w-full p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
          <Button asChild className="w-full sm:w-auto">
            <Link href="/dashboard/operators/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Operator
            </Link>
          </Button>
        </div>

        <Suspense fallback={<LoadingOverlay />}>
          <OperatorsContent />
        </Suspense>
      </div>
    </DashboardPageWrapper>
  )
}
