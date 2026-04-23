import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardPageWrapper } from "@/components/dashboard-page-wrapper";
import { GstFilingsPageClient } from "@/app/dashboard/gst-filings/gst-filings-page-client";

export default async function GstFilingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "accountant") {
    redirect("/dashboard");
  }

  const [clientsResult, invoicesResult] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .not("tax_id", "is", null)
      .not("tax_id", "eq", "")
      .not("tax_id", "ilike", "no gst%")
      .order("name", { ascending: true }),
    supabase
      .from("invoices")
      .select(
        `
        id,
        client_id,
        invoice_number,
        issue_date,
        subtotal,
        tax_amount,
        total_amount,
        gst_percent,
        split_gst,
        payments(tds_amount),
        clients!inner(name, tax_id),
        invoice_items(line_total, products(hsn_code))
      `,
      )
      .eq("status", "paid")
      .not("clients.tax_id", "is", null)
      .not("clients.tax_id", "eq", "")
      .not("clients.tax_id", "ilike", "no gst%")
      .order("issue_date", { ascending: true }),
  ]);

  return (
    <DashboardPageWrapper title="GST Filing">
      <div className="w-full p-4 sm:p-6 lg:p-8 space-y-4">
        <GstFilingsPageClient
          clients={clientsResult.data || []}
          invoices={(invoicesResult.data as any[]) || []}
        />
      </div>
    </DashboardPageWrapper>
  );
}
