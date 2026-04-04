import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  FileText,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { DashboardCharts } from "@/components/dashboard-charts";
import { DashboardPageWrapper } from "@/components/dashboard-page-wrapper";
import { DashboardClient } from "./dashboard-client";
import { DashboardRefresh } from "@/components/dashboard-refresh";
import { Suspense } from "react";
import { LoadingOverlay } from "@/components/loading-overlay";

// Prevent caching to ensure fresh data on every request
export const revalidate = 0;

function getCurrentFinancialYearRange() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed
  const startYear = month < 3 ? year - 1 : year;
  const endYear = startYear + 1;
  return {
    start: `${startYear}-04-01`,
    end: `${endYear}-03-31`,
    fy: `${startYear}-${endYear}`,
  };
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "accountant") redirect("/dashboard/gst-filings");
  if (profile?.role === "admin") redirect("/dashboard/clients");
  if (profile?.role === "billing_executive") redirect("/dashboard/quotations");

  const fyRange = getCurrentFinancialYearRange();

  const [
    clientsCountResult,
    fyInvoicesResult,
    fyPaymentsResult,
    allClientsResult,
    allInvoicesResult,
  ] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase
      .from("invoices")
      .select("*, clients(name)")
      .gte("issue_date", fyRange.start)
      .lte("issue_date", fyRange.end)
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("*")
      .gte("payment_date", fyRange.start)
      .lte("payment_date", fyRange.end)
      .order("payment_date", { ascending: false }),
    supabase.from("clients").select("id, name").order("name", { ascending: true }),
    supabase
      .from("invoices")
      .select("*, clients(name, email)")
      .order("created_at", { ascending: false }),
  ]);

  const totalClients = clientsCountResult.count || 0;
  const fyInvoices = fyInvoicesResult.data || [];
  const fyPayments = fyPaymentsResult.data || [];

  const today = new Date();
  const msInDay = 1000 * 60 * 60 * 24;

  // Core KPIs
  const totalRevenue = fyPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  let totalInvoiced = 0;
  let totalOutstanding = 0;
  let paidInvoices = 0;
  let overdueInvoices = 0;
  let draftInvoices = 0;
  let hasOverdueInvoices = false;

  // Overdue breakdown by days
  const overdueBreakdown: Record<
    string,
    { count: number; invoices: typeof fyInvoices }
  > = {
    "0-7": { count: 0, invoices: [] },
    "8-14": { count: 0, invoices: [] },
    "15-30": { count: 0, invoices: [] },
    "31-60": { count: 0, invoices: [] },
    "60+": { count: 0, invoices: [] },
  };

  for (const inv of fyInvoices) {
    const totalAmount = Number(inv.total_amount);
    const amountPaid = Number(inv.amount_paid);
    const balance = totalAmount - amountPaid;
    totalInvoiced += totalAmount;

    if (inv.status !== "paid" && inv.status !== "cancelled") {
      totalOutstanding += balance;
    }

    if (inv.status === "paid") {
      paidInvoices += 1;
    }

    if (inv.status === "draft") {
      draftInvoices += 1;
    }

    const daysOverdue = Math.floor(
      (today.getTime() - new Date(inv.due_date).getTime()) / msInDay,
    );
    if (balance > 0 && daysOverdue > 0) {
      overdueInvoices += 1;
      hasOverdueInvoices = true;
      if (daysOverdue <= 7) {
        overdueBreakdown["0-7"].invoices.push(inv);
        overdueBreakdown["0-7"].count++;
      } else if (daysOverdue <= 14) {
        overdueBreakdown["8-14"].invoices.push(inv);
        overdueBreakdown["8-14"].count++;
      } else if (daysOverdue <= 30) {
        overdueBreakdown["15-30"].invoices.push(inv);
        overdueBreakdown["15-30"].count++;
      } else if (daysOverdue <= 60) {
        overdueBreakdown["31-60"].invoices.push(inv);
        overdueBreakdown["31-60"].count++;
      } else {
        overdueBreakdown["60+"].invoices.push(inv);
        overdueBreakdown["60+"].count++;
      }
    }
  }

  // Top clients by revenue
  const clientRevenue = fyInvoices.reduce(
    (acc, invoice) => {
      const clientName = (invoice.clients as { name: string } | null)?.name ?? "Unknown";
      if (!acc[clientName])
        acc[clientName] = { total: 0, paid: 0, outstanding: 0, invoiceCount: 0 };
      acc[clientName].total += Number(invoice.total_amount);
      acc[clientName].paid += Number(invoice.amount_paid);
      acc[clientName].outstanding +=
        Number(invoice.total_amount) - Number(invoice.amount_paid);
      acc[clientName].invoiceCount += 1;
      return acc;
    },
    {} as Record<
      string,
      { total: number; paid: number; outstanding: number; invoiceCount: number }
    >,
  );

  type ClientRevenueData = { total: number; paid: number; outstanding: number; invoiceCount: number };
  const topClients = (Object.entries(clientRevenue) as [string, ClientRevenueData][])
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 10);

  // Recent activity
  const recentInvoices = fyInvoices.slice(0, 10);
  const recentPayments = fyPayments.slice(0, 10);

  // Shape data for DashboardCharts
  const chartsInvoices = fyInvoices.map((inv) => ({
    id: inv.id,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    total_amount: inv.total_amount,
    amount_paid: inv.amount_paid,
    status: inv.status,
  }));
  const chartsPayments = fyPayments.map((p) => ({
    amount: p.amount,
    payment_date: p.payment_date,
  }));

  return (
    <DashboardPageWrapper title="Dashboard Overview">
      <div className="w-full p-4 sm:p-6 lg:p-8">
        {/* Header row */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-xs sm:text-sm text-muted-foreground">
            Financial Year:{" "}
            <span className="font-semibold text-foreground">{fyRange.fy}</span>
          </p>
          <DashboardRefresh />
        </div>

        {/* Row 1: Core KPIs */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">
                Total Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">
                ₹{totalRevenue.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                FY {fyRange.fy} payments received
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">
                Total Invoiced
              </CardTitle>
              <FileText className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">
                ₹{totalInvoiced.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {fyInvoices.length} invoices this FY
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">
                Outstanding
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">
                ₹{totalOutstanding.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Pending payment collection
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">
                Active Clients
              </CardTitle>
              <Users className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{totalClients}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Total clients in system
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Invoice Status */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">
                Paid Invoices
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{paidInvoices}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Successfully completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">
                Overdue Invoices
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-red-600">
                {overdueInvoices}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Require immediate attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">
                Draft Invoices
              </CardTitle>
              <Clock className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{draftInvoices}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Not yet sent to clients
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts: Pending/Outstanding/Collection Rate/Avg Invoice + 3 charts */}
        <Suspense fallback={<LoadingOverlay />}>
          <DashboardCharts invoices={chartsInvoices} payments={chartsPayments} />
        </Suspense>

        {/* Tabs: Client View | Overdue by Days | Top Clients | Recent Activity */}
        <Tabs defaultValue="client" className="mt-8 space-y-6">
          <TabsList>
            <TabsTrigger value="client">Client View</TabsTrigger>
            <TabsTrigger value="overdues">Overdue by Days</TabsTrigger>
            <TabsTrigger value="top-clients">Top Clients</TabsTrigger>
            <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          </TabsList>

          {/* Client View tab */}
          <TabsContent value="client">
            <DashboardClient
              clients={allClientsResult.data || []}
              invoices={allInvoicesResult.data || []}
            />
          </TabsContent>

          {/* Overdue by Days tab */}
          <TabsContent value="overdues" className="space-y-6">
            <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 mb-6">
              {Object.entries(overdueBreakdown).map(([range, data]) => (
                <Card key={range}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs sm:text-sm font-medium">
                      {range} Days
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg sm:text-2xl font-bold text-red-600">
                      {data.count}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {data.count === 1 ? "invoice" : "invoices"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Overdue Invoices Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {!hasOverdueInvoices ? (
                  <p className="text-center text-muted-foreground py-8">
                    No overdue invoices — great job!
                  </p>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(overdueBreakdown).map(([range, data]) => (
                      <div key={range}>
                        <h4 className="font-semibold text-sm mb-3">
                          {range} Days Overdue ({data.count})
                        </h4>
                        {data.invoices.length > 0 ? (
                          <div className="border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/50">
                                  <TableHead className="text-xs">
                                    Invoice #
                                  </TableHead>
                                  <TableHead className="text-xs">
                                    Client
                                  </TableHead>
                                  <TableHead className="text-xs text-right">
                                    Amount
                                  </TableHead>
                                  <TableHead className="text-xs text-right">
                                    Balance
                                  </TableHead>
                                  <TableHead className="text-xs text-right">
                                    Due Date
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {data.invoices.slice(0, 5).map((inv) => {
                                  const balance =
                                    Number(inv.total_amount) -
                                    Number(inv.amount_paid);
                                  const dueDate = new Date(inv.due_date);
                                  const daysOverdue = Math.floor(
                                    (today.getTime() - dueDate.getTime()) /
                                      msInDay,
                                  );
                                  return (
                                    <TableRow key={inv.id}>
                                      <TableCell className="text-xs font-medium">
                                        #{inv.invoice_number}
                                      </TableCell>
                                      <TableCell className="text-xs">
                                        {(inv.clients as { name: string } | null)?.name ?? "—"}
                                      </TableCell>
                                      <TableCell className="text-xs text-right">
                                        ₹
                                        {Number(inv.total_amount).toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-xs text-right font-semibold text-red-600">
                                        ₹{balance.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-xs text-right">
                                        {dueDate.toLocaleDateString("en-IN")}
                                        <br />
                                        <span className="text-red-600 font-semibold">
                                          {daysOverdue}d
                                        </span>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                            {data.invoices.length > 5 && (
                              <div className="px-4 py-2 bg-muted/50 text-xs text-muted-foreground border-t">
                                +{data.invoices.length - 5} more invoice
                                {data.invoices.length - 5 > 1 ? "s" : ""}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Top Clients tab */}
          <TabsContent value="top-clients" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Clients by Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                {topClients.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No client data available
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client Name</TableHead>
                        <TableHead className="text-right">
                          Total Invoiced
                        </TableHead>
                        <TableHead className="text-right">Amount Paid</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead className="text-right">Invoices</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topClients.map(([clientName, data]) => (
                        <TableRow key={clientName}>
                          <TableCell className="font-medium">
                            {clientName}
                          </TableCell>
                          <TableCell className="text-right">
                            ₹{data.total.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            ₹{data.paid.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-orange-600">
                            ₹{data.outstanding.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {data.invoiceCount}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recent Activity tab */}
          <TabsContent value="activity" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Invoices</CardTitle>
                </CardHeader>
                <CardContent>
                  {recentInvoices.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No invoices yet
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {recentInvoices.map((invoice) => (
                        <div
                          key={invoice.id}
                          className="flex items-center justify-between border-b pb-3 last:border-0"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              {invoice.invoice_number}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(invoice.clients as { name: string } | null)?.name ?? "—"}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">
                              ₹{Number(invoice.total_amount).toFixed(2)}
                            </span>
                            <Badge
                              variant="secondary"
                              className={
                                invoice.status === "paid"
                                  ? "bg-green-100 text-green-800"
                                  : invoice.status === "overdue"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-blue-100 text-blue-800"
                              }
                            >
                              {invoice.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Payments</CardTitle>
                </CardHeader>
                <CardContent>
                  {recentPayments.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No payments yet
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {recentPayments.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between border-b pb-3 last:border-0"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-medium capitalize">
                              {payment.payment_method?.replace("_", " ") ?? "—"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(
                                payment.payment_date,
                              ).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-green-600">
                              ₹{Number(payment.amount).toFixed(2)}
                            </span>
                            <Badge
                              variant="secondary"
                              className={
                                payment.status === "completed"
                                  ? "bg-green-100 text-green-800"
                                  : payment.status === "failed"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-yellow-100 text-yellow-800"
                              }
                            >
                              {payment.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardPageWrapper>
  );
}
