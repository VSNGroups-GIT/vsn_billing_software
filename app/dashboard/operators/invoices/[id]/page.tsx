import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { OperatorPaymentForm } from "@/components/operator-payment-form";
import { OperatorInvoiceForm } from "@/components/operator-invoice-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { ArrowLeft, CreditCard } from "lucide-react";

const statusConfig: Record<string, { label: string; className: string }> = {
  unpaid: { label: "Unpaid", className: "bg-red-100 text-red-800" },
  partially_paid: { label: "Partial", className: "bg-yellow-100 text-yellow-800" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800" },
};

const methodLabels: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  check: "Cheque",
  credit_card: "Credit Card",
  other: "Other",
};

export default async function OperatorInvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pay?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const showPayForm = sp.pay === "1";

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

  const { data: invoice } = await supabase
    .from("operator_invoices")
    .select("*, operators(id, name)")
    .eq("id", id)
    .single();

  if (!invoice) notFound();

  const { data: payments } = await supabase
    .from("operator_payments")
    .select("*")
    .eq("operator_invoice_id", id)
    .order("payment_date", { ascending: false });

  const { data: operators } = await supabase
    .from("operators")
    .select("id, name")
    .eq("organization_id", profile.organization_id)
    .eq("is_active", true)
    .order("name");

  const hasPayments = (payments?.length ?? 0) > 0;
  const balance = Number(invoice.total_amount) - Number(invoice.amount_paid);
  const cfg = statusConfig[invoice.status] ?? { label: invoice.status, className: "" };

  const fmt = (v: string | number) =>
    `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/operators/invoices">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Invoice: {invoice.invoice_number}</h1>
        <Badge className={`text-xs ${cfg.className}`}>{cfg.label}</Badge>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Invoice Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Operator</span><span className="font-medium">{invoice.operators?.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Invoice No.</span><span>{invoice.invoice_number}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{new Date(invoice.invoice_date).toLocaleDateString("en-IN")}</span></div>
            {invoice.due_date && <div className="flex justify-between"><span className="text-muted-foreground">Due Date</span><span>{new Date(invoice.due_date).toLocaleDateString("en-IN")}</span></div>}
            {Number(invoice.taxable_amount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Taxable</span><span>{fmt(invoice.taxable_amount)}</span></div>}
            {Number(invoice.tax_amount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{fmt(invoice.tax_amount)}</span></div>}
            <div className="flex justify-between border-t pt-2 font-bold"><span>Total</span><span>{fmt(invoice.total_amount)}</span></div>
            <div className="flex justify-between text-green-700"><span>Paid</span><span>{fmt(invoice.amount_paid)}</span></div>
            <div className="flex justify-between font-semibold"><span>Balance</span><span className={balance > 0 ? "text-red-700" : "text-green-700"}>{fmt(balance)}</span></div>
            {invoice.file_url && (
              <div className="pt-2">
                <a href={invoice.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                  View uploaded PDF: {invoice.file_name || "invoice.pdf"}
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Form or Record Payment Button */}
        {balance > 0 ? (
          showPayForm ? (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Record Payment
              </h2>
              <OperatorPaymentForm
                invoice={{
                  id: invoice.id,
                  invoice_number: invoice.invoice_number,
                  total_amount: Number(invoice.total_amount),
                  amount_paid: Number(invoice.amount_paid),
                  operators: invoice.operators,
                }}
              />
            </div>
          ) : (
            <div className="flex items-start">
              <Button asChild size="lg" className="mt-2">
                <Link href={`/dashboard/operators/invoices/${id}?pay=1`}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Record Payment
                </Link>
              </Button>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center rounded-lg border bg-green-50 p-8">
            <p className="text-green-700 font-semibold">Invoice fully paid ✓</p>
          </div>
        )}
      </div>

      {/* Payment History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          {!payments || payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-xs sm:text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{new Date(p.payment_date).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(p.amount)}</TableCell>
                      <TableCell>{methodLabels[p.payment_method] || p.payment_method}</TableCell>
                      <TableCell>{p.reference_number || "-"}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${(statusConfig[p.status] ?? { className: "" }).className}`}>
                          {(statusConfig[p.status] ?? { label: p.status }).label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Invoice */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Edit Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          {hasPayments ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Editing is locked because payment has already been recorded for this invoice.
            </div>
          ) : (
            <OperatorInvoiceForm
              operators={operators || []}
              initialData={{
                id: invoice.id,
                operator_id: invoice.operator_id,
                invoice_number: invoice.invoice_number,
                invoice_date: invoice.invoice_date,
                due_date: invoice.due_date,
                taxable_amount: Number(invoice.taxable_amount),
                tax_amount: Number(invoice.tax_amount),
                total_amount: Number(invoice.total_amount),
                notes: invoice.notes,
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
