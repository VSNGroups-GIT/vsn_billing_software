import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { Notes } from "@/components/notes";

const statusConfig = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
  refunded: { label: "Refunded", className: "bg-slate-100 text-slate-800" },
};

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch payment with related data
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select(
      `
      *,
      invoices (
        id,
        invoice_number,
        total_amount,
        amount_paid,
        status,
        clients (
          name,
          email
        )
      ),
      profiles!payments_created_by_fkey (
        full_name
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (paymentError) {
    // if no rows found, treat as not found
    notFound();
  }
  if (!payment) {
    notFound();
  }

  // Get user role
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let userRole = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    userRole = profile?.role;
  }

  // Fetch payment notes
  const { data: paymentNotesData } = await supabase
    .from("payment_notes")
    .select(
      `
      id,
      note,
      created_at,
      created_by,
      created_by_profile:profiles!created_by (
        full_name,
        role
      )
    `,
    )
    .eq("payment_id", id)
    .order("created_at", { ascending: false });

  // Transform notes to match expected type and filter out those with null profiles
  const paymentNotes =
    (paymentNotesData || [])
      .filter((note: any) => note.created_by_profile !== null)
      .map((note: any) => ({
        id: note.id,
        note: note.note,
        created_at: note.created_at,
        profiles: note.created_by_profile,
      })) || [];

  const config = statusConfig[payment.status as keyof typeof statusConfig];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/payments">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Payments
            </Link>
          </Button>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/dashboard/invoices/${payment.invoices.id}`}>
            <FileText className="h-4 w-4 mr-2" />
            View Invoice
          </Link>
        </Button>
      </div>

      {/* Payment Details Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Payment Details</CardTitle>
            <Badge variant="secondary" className={config.className}>
              {config.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Payment Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Payment Date</p>
                <p className="font-medium">
                  {new Date(payment.payment_date).toLocaleDateString("en-IN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Amount</p>
                <p className="text-2xl font-bold text-green-600">
                  ₹
                  {Number(payment.amount).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>

              {Number(payment.mediator_amount || 0) > 0 && (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Mediator Deduction
                    </p>
                    <p className="font-medium text-amber-700">
                      ₹
                      {Number(payment.mediator_amount).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Net Received</p>
                    <p className="font-semibold text-green-700">
                      ₹
                      {Number(
                        payment.net_amount ?? payment.amount,
                      ).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </>
              )}

              {Number(payment.tds_amount || 0) > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">TDS</p>
                  <p className="font-medium text-blue-700">
                    ₹
                    {Number(payment.tds_amount || 0).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground">Payment Method</p>
                <p className="font-medium capitalize">
                  {payment.payment_method.replace("_", " ")}
                </p>
              </div>

              {payment.reference_number && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Reference Number
                  </p>
                  <p className="font-medium">{payment.reference_number}</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Invoice</p>
                <Link
                  href={`/dashboard/invoices/${payment.invoices.id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {payment.invoices.invoice_number}
                </Link>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Client</p>
                <p className="font-medium">{payment.invoices.clients.name}</p>
                <p className="text-sm text-muted-foreground">
                  {payment.invoices.clients.email}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Recorded By</p>
                <p className="font-medium">
                  {payment.profiles?.full_name || "Unknown"}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Recorded At</p>
                <p className="font-medium">
                  {new Date(payment.created_at).toLocaleDateString("en-IN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Invoice Status Summary */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">Invoice Payment Status</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Invoice Total</p>
                <p className="font-bold">
                  ₹
                  {Number(payment.invoices.total_amount).toLocaleString(
                    "en-IN",
                    {
                      minimumFractionDigits: 2,
                    },
                  )}
                </p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="font-bold text-green-600">
                  ₹
                  {Number(payment.invoices.amount_paid).toLocaleString(
                    "en-IN",
                    {
                      minimumFractionDigits: 2,
                    },
                  )}
                </p>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Remaining</p>
                <p className="font-bold text-orange-600">
                  ₹
                  {(
                    Number(payment.invoices.total_amount) -
                    Number(payment.invoices.amount_paid)
                  ).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes Section */}
      <Notes
        notes={paymentNotes}
        referenceId={id}
        referenceType="payment"
        userRole={userRole}
      />
    </div>
  );
}
