import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { OperatorInvoicesTable } from "@/components/operator-invoices-table";
import { DashboardPageWrapper } from "@/components/dashboard-page-wrapper";
import { Suspense } from "react";
import { LoadingOverlay } from "@/components/loading-overlay";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

async function OperatorInvoicesContent() {
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

  const { data: invoices } = await supabase
    .from("operator_invoices")
    .select("*, operators(name)")
    .eq("organization_id", profile.organization_id)
    .order("invoice_date", { ascending: false });

  // Summary stats
  const all = invoices || [];
  const totalAmount = all.reduce((s, i) => s + Number(i.total_amount), 0);
  const totalPaid = all.reduce((s, i) => s + Number(i.amount_paid), 0);
  const totalBalance = totalAmount - totalPaid;
  const unpaidCount = all.filter((i) => i.status === "unpaid" || i.status === "partially_paid").length;

  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Total Invoices", value: String(all.length), color: "" },
          { label: "Total Amount", value: fmt(totalAmount), color: "" },
          { label: "Total Paid", value: fmt(totalPaid), color: "text-green-700" },
          { label: "Balance Due", value: fmt(totalBalance), color: totalBalance > 0 ? "text-red-700" : "text-green-700" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="bg-white">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {unpaidCount > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800 mb-4">
          {unpaidCount} invoice{unpaidCount > 1 ? "s" : ""} pending payment.
        </div>
      )}
      <OperatorInvoicesTable invoices={all} />
    </>
  );
}

export default async function OperatorInvoicesPage() {
  return (
    <DashboardPageWrapper title="Operator Invoices">
      <div className="w-full p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
          <Button asChild className="w-full sm:w-auto">
            <Link href="/dashboard/operators/invoices/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Invoice
            </Link>
          </Button>
        </div>

        <Suspense fallback={<LoadingOverlay />}>
          <OperatorInvoicesContent />
        </Suspense>
      </div>
    </DashboardPageWrapper>
  );
}
