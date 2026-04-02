import { createClient } from "@/lib/supabase/server";
import { OperatorInvoiceForm } from "@/components/operator-invoice-form";
import { redirect } from "next/navigation";

export default async function NewOperatorInvoicePage() {
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

  const { data: operators } = await supabase
    .from("operators")
    .select("id, name")
    .eq("organization_id", profile.organization_id)
    .eq("is_active", true)
    .order("name");

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Add Operator Invoice</h1>
        <p className="text-muted-foreground mt-1">
          Record an invoice received from an operator. Upload the PDF to auto-fill details.
        </p>
      </div>
      <div className="max-w-2xl">
        <OperatorInvoiceForm operators={operators || []} />
      </div>
    </div>
  );
}
