import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { DashboardPageWrapper } from "@/components/dashboard-page-wrapper";
import { OperatorPaymentsTable } from "@/components/operator-payments-table";
import { Suspense } from "react";
import { LoadingOverlay } from "@/components/loading-overlay";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

async function OperatorPaymentsContent() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  if (!profile?.organization_id) redirect("/dashboard");

  const { data: payments } = await supabase
    .from("operator_payments")
    .select("*, operator_invoices(id, invoice_number, total_amount, operators(name))")
    .eq("organization_id", profile.organization_id)
    .order("payment_date", { ascending: false });

  const all = payments || [];
  const totalPaid = all.reduce((s, p) => s + Number(p.amount), 0);

  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Card className="bg-white">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Payments</p>
            <p className="text-lg font-bold mt-1">{all.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Amount Paid</p>
            <p className="text-lg font-bold mt-1 text-green-700">{fmt(totalPaid)}</p>
          </CardContent>
        </Card>
      </div>
      <OperatorPaymentsTable payments={all} />
    </>
  );
}

export default async function OperatorPaymentsPage() {
  return (
    <DashboardPageWrapper title="Operator Payments">
      <div className="w-full p-4 sm:p-6 lg:p-8 space-y-4">
        <Suspense fallback={<LoadingOverlay />}>
          <OperatorPaymentsContent />
        </Suspense>
      </div>
    </DashboardPageWrapper>
  );
}
