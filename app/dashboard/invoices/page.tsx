import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { InvoicesPageClient } from "./invoices-page-client";
import { DashboardPageWrapper } from "@/components/dashboard-page-wrapper";
import { Suspense } from "react";
import { LoadingOverlay } from "@/components/loading-overlay";
import { redirect } from "next/navigation";

export default async function InvoicesPage() {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get user profile
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

  if (userRole === "billing_executive") {
    redirect("/dashboard/clients");
  }

  // Get all clients for selector
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .order("name", { ascending: true });

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      `
      *,
      clients(name, email),
      profiles!invoices_created_by_fkey(full_name, email)
    `,
    )
    .order("created_at", { ascending: false });

  return (
    <DashboardPageWrapper title="Invoices">
      <div className="w-full p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
          <Button asChild className="w-full sm:w-auto">
            <Link href="/dashboard/invoices/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Invoice
            </Link>
          </Button>
        </div>

        <Suspense fallback={<LoadingOverlay />}>
          <InvoicesPageClient
            clients={clients || []}
            invoices={invoices || []}
            userRole={userRole}
          />
        </Suspense>
      </div>
    </DashboardPageWrapper>
  );
}
