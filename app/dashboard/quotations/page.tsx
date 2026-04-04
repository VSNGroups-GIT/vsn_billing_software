import { createClient } from "@/lib/supabase/server";
import { DashboardPageWrapper } from "@/components/dashboard-page-wrapper";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { QuotationsPageClient } from "./quotations-page-client";
import { Suspense } from "react";
import { LoadingOverlay } from "@/components/loading-overlay";
import { redirect } from "next/navigation";

export default async function QuotationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userRole: string | undefined;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    userRole = profile?.role;
  }

  if (userRole === "accountant") {
    redirect("/dashboard/gst-filings");
  }

  const [clientsResult, quotationsResult] = await Promise.all([
    supabase.from("clients").select("id, name").order("name", { ascending: true }),
    supabase
      .from("quotations")
      .select("*, clients(name, email), profiles!quotations_created_by_fkey(full_name, email)")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <DashboardPageWrapper title="Quotations">
      <div className="w-full p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
          <Button asChild className="w-full sm:w-auto">
            <Link href="/dashboard/quotations/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Quotation
            </Link>
          </Button>
        </div>

        <Suspense fallback={<LoadingOverlay />}>
          <QuotationsPageClient
            clients={clientsResult.data || []}
            quotations={(quotationsResult.data as any[]) || []}
            userRole={userRole}
          />
        </Suspense>
      </div>
    </DashboardPageWrapper>
  );
}
