"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  Download,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useMemo, ReactNode } from "react";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { exportToCSVAsync, exportToPDF, ExportColumn, getTimestamp } from "@/lib/export-utils";
import { Input } from "@/components/ui/input";

interface Payment {
  id: string;
  invoice_id: string;
  amount: string;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  status: string;
  invoices: {
    id: string;
    invoice_number: string;
    total_amount: string;
    amount_paid: string;
    clients: {
      name: string;
    };
  };
  profiles?: {
    full_name: string | null;
    email: string | null;
  } | null;
}

interface PaymentsTableProps {
  payments: Payment[];
  toolbarLeft?: ReactNode;
  fromDate?: string;
  toDate?: string;
  userRole?: string;
}

const statusConfig = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
  refunded: { label: "Refunded", className: "bg-slate-100 text-slate-800" },
};

export function PaymentsTable({
  payments,
  toolbarLeft,
  fromDate = "",
  toDate = "",
  userRole,
}: PaymentsTableProps) {
  const showCreatedBy = userRole === "super_admin";
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Pagination state
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Filter state
  const [filters, setFilters] = useState({
    invoice: "",
    client: "",
    method: "",
    creator: "",
  });

  // Date range filter (by payment_date)
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const handleFilterChange = (column: string, value: string) => {
    setFilters((prev) => ({ ...prev, [column]: value }));
  };

  // Apply filtering and sorting
  const processedPayments = useMemo(() => {
    let filtered = [...payments];
    const invoiceQuery = filters.invoice.trim().toLowerCase();
    const clientQuery = filters.client.trim().toLowerCase();
    const methodQuery = filters.method.trim().toLowerCase();
    const creatorQuery = filters.creator.trim().toLowerCase();

    // Apply filters
    if (invoiceQuery) {
      filtered = filtered.filter((p) =>
        p.invoices.invoice_number
          .toLowerCase()
          .includes(invoiceQuery),
      );
    }
    if (clientQuery) {
      filtered = filtered.filter((p) =>
        p.invoices.clients.name
          .toLowerCase()
          .includes(clientQuery),
      );
    }
    if (methodQuery) {
      filtered = filtered.filter((p) =>
        p.payment_method.toLowerCase().includes(methodQuery),
      );
    }
    if (creatorQuery) {
      filtered = filtered.filter((p) => {
        const creatorName = p.profiles?.full_name?.toLowerCase() || "";
        const creatorEmail = p.profiles?.email?.toLowerCase() || "";
        return creatorName.includes(creatorQuery) || creatorEmail.includes(creatorQuery);
      });
    }

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortColumn) {
          case "date":
            aVal = new Date(a.payment_date).getTime();
            bVal = new Date(b.payment_date).getTime();
            break;
          case "invoice":
            aVal = a.invoices.invoice_number;
            bVal = b.invoices.invoice_number;
            break;
          case "client":
            aVal = a.invoices.clients.name;
            bVal = b.invoices.clients.name;
            break;
          case "amount":
            aVal = Number(a.amount);
            bVal = Number(b.amount);
            break;
          case "method":
            aVal = a.payment_method;
            bVal = b.payment_method;
            break;
          case "status":
            aVal = a.status;
            bVal = b.status;
            break;
          case "creator":
            aVal = a.profiles?.full_name || a.profiles?.email || "";
            bVal = b.profiles?.full_name || b.profiles?.email || "";
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [payments, filters, sortColumn, sortDirection]);

  const pagination = usePagination({
    items: processedPayments,
    itemsPerPage,
  });

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column)
      return <ArrowUpDown className="ml-2 h-4 w-4 inline opacity-40" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-2 h-4 w-4 inline" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4 inline" />
    );
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    const supabase = createClient();

    try {
      // First, fetch the payment to get invoice_id and amount
      const { data: payment, error: fetchError } = await supabase
        .from("payments")
        .select("invoice_id, amount")
        .eq("id", id)
        .maybeSingle();

      if (fetchError) {
        console.error("Fetch payment error:", fetchError);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to fetch payment details.",
        });
        setIsDeleting(false);
        return;
      }

      if (!payment) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Payment not found.",
        });
        setIsDeleting(false);
        return;
      }

      if (!payment.invoice_id) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Payment has no associated invoice.",
        });
        setIsDeleting(false);
        return;
      }

      // Fetch invoice details FIRST before deleting
      const { data: invoice, error: invoiceFetchError } = await supabase
        .from("invoices")
        .select("amount_paid, total_amount")
        .eq("id", payment.invoice_id)
        .maybeSingle();

      if (invoiceFetchError) {
        console.error("Fetch invoice error:", invoiceFetchError);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to fetch invoice details.",
        });
        setIsDeleting(false);
        return;
      }

      if (!invoice) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Associated invoice not found.",
        });
        setIsDeleting(false);
        return;
      }

      // Calculate new amounts BEFORE deletion
      const newAmountPaid = Math.max(
        0,
        Number(invoice.amount_paid || 0) - Number(payment.amount || 0),
      );
      const totalAmount = Number(invoice.total_amount || 0);

      // Determine status based on payment amount
      let newStatus = "recorded";
      if (newAmountPaid > 0 && newAmountPaid < totalAmount) {
        newStatus = "partially_paid";
      } else if (newAmountPaid >= totalAmount) {
        newStatus = "paid";
      }

      // Now delete the payment
      const { error: deleteError } = await supabase
        .from("payments")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("Delete payment error:", deleteError);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to delete payment.",
        });
        setIsDeleting(false);
        return;
      }

      // Update the invoice after successful payment deletion
      const { error: updateError } = await supabase
        .from("invoices")
        .update({ amount_paid: newAmountPaid, status: newStatus })
        .eq("id", payment.invoice_id);

      if (updateError) {
        console.error("Update invoice error:", updateError);
        toast({
          variant: "destructive",
          title: "Error",
          description:
            "Payment deleted but failed to update invoice status. Please refresh the page.",
        });
        setIsDeleting(false);
        return;
      }

      toast({
        variant: "success",
        title: "Payment deleted",
        description:
          "The payment has been deleted successfully and invoice status has been updated.",
      });
      router.refresh();
    } catch (error) {
      console.error("Unexpected error during payment deletion:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred while deleting the payment.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async () => {
    const columns: ExportColumn[] = [
      {
        key: "invoices",
        label: "Invoice Number",
        formatter: (inv) => inv?.invoice_number || "",
      },
      {
        key: "invoices",
        label: "Client",
        formatter: (inv) => inv?.clients?.name || "",
      },
      {
        key: "amount",
        label: "Amount",
        formatter: (amount) => Number(amount).toFixed(2),
      },
      {
        key: "payment_date",
        label: "Payment Date",
        formatter: (date) =>
          new Date(date).toLocaleDateString("en-IN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }),
      },
      { key: "payment_method", label: "Payment Method" },
      { key: "reference_number", label: "Reference Number" },
      {
        key: "status",
        label: "Status",
        formatter: (status) =>
          statusConfig[status as keyof typeof statusConfig]?.label || status,
      },
      {
        key: "profiles",
        label: "Created By",
        formatter: (profile) => profile?.full_name || profile?.email || "-",
      },
    ];

    await exportToCSVAsync(processedPayments, columns, `payments-${getTimestamp()}.csv`);
    toast({
      variant: "success",
      title: "Exported",
      description: `${processedPayments.length} payment(s) exported to CSV successfully.`,
    });
  };

  const handleExportPDF = async () => {
    const enrichedPayments = processedPayments.map((p) => ({
      ...p,
      invoice_number: p.invoices.invoice_number,
      client_name: p.invoices.clients.name,
      amount_fmt: `Rs.${Number(p.amount).toFixed(2)}`,
      payment_date_fmt: new Date(p.payment_date).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
      method_label: p.payment_method.replace(/_/g, " "),
      status_label:
        statusConfig[p.status as keyof typeof statusConfig]?.label || p.status,
      created_by_label:
        p.profiles?.full_name || p.profiles?.email || "-",
    }));

    const pdfColumns: ExportColumn[] = [
      { key: "payment_date_fmt", label: "Date" },
      { key: "invoice_number", label: "Invoice #" },
      { key: "client_name", label: "Client" },
      { key: "amount_fmt", label: "Amount" },
      { key: "method_label", label: "Method" },
      { key: "reference_number", label: "Reference" },
      { key: "status_label", label: "Status" },
      { key: "created_by_label", label: "Created By" },
    ];

    const rangeLabel =
      fromDate || toDate
        ? ` (${fromDate || "..."} to ${toDate || "..."})`
        : "";
    await exportToPDF(
      enrichedPayments,
      pdfColumns,
      `Payments${rangeLabel}`,
      `payments-${getTimestamp()}.pdf`,
    );
    toast({
      variant: "success",
      title: "Exported",
      description: `${enrichedPayments.length} payment(s) exported to PDF successfully.`,
    });
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:gap-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">{toolbarLeft}</div>
          <div className="flex gap-2">
            <Button
              onClick={handleExport}
              size="sm"
              variant="outline"
              title="Export to CSV"
              disabled={processedPayments.length === 0}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">CSV</span>
            </Button>
            <Button
              onClick={handleExportPDF}
              size="sm"
              variant="outline"
              title="Export to PDF"
              disabled={processedPayments.length === 0}
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">PDF</span>
            </Button>
          </div>
        </div>
      </div>

      {processedPayments.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-white">
          <p className="text-muted-foreground">
            No payments found for the selected filters.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-white overflow-x-auto">
            <Table className="text-xs sm:text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                    onClick={() => handleSort("date")}
                  >
                    Date
                    <SortIcon column="date" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                    onClick={() => handleSort("invoice")}
                  >
                    Invoice
                    <SortIcon column="invoice" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                    onClick={() => handleSort("client")}
                  >
                    Client
                    <SortIcon column="client" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                    onClick={() => handleSort("amount")}
                  >
                    Amount
                    <SortIcon column="amount" />
                  </TableHead>
                  <TableHead
                    className="hidden md:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                    onClick={() => handleSort("method")}
                  >
                    Method
                    <SortIcon column="method" />
                  </TableHead>
                  <TableHead className="hidden lg:table-cell px-2 sm:px-4 py-2 sm:py-3">
                    Reference
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                    onClick={() => handleSort("status")}
                  >
                    Status
                    <SortIcon column="status" />
                  </TableHead>
                  {showCreatedBy && (
                    <TableHead
                      className="hidden xl:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                      onClick={() => handleSort("creator")}
                    >
                      Created By
                      <SortIcon column="creator" />
                    </TableHead>
                  )}
                  <TableHead className="text-right px-2 sm:px-4 py-2 sm:py-3">
                    Actions
                  </TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="px-2 sm:px-4 py-2 sm:py-3"></TableHead>
                  <TableHead className="px-2 sm:px-4 py-2 sm:py-3">
                    <Input
                      placeholder="Filter..."
                      value={filters.invoice}
                      onChange={(e) =>
                        handleFilterChange("invoice", e.target.value)
                      }
                      className="h-7 text-xs"
                    />
                  </TableHead>
                  <TableHead className="px-2 sm:px-4 py-2 sm:py-3">
                    <Input
                      placeholder="Filter..."
                      value={filters.client}
                      onChange={(e) =>
                        handleFilterChange("client", e.target.value)
                      }
                      className="h-7 text-xs"
                    />
                  </TableHead>
                  <TableHead className="px-2 sm:px-4 py-2 sm:py-3"></TableHead>
                  <TableHead className="hidden md:table-cell px-2 sm:px-4 py-2 sm:py-3">
                    <Input
                      placeholder="Filter..."
                      value={filters.method}
                      onChange={(e) =>
                        handleFilterChange("method", e.target.value)
                      }
                      className="h-7 text-xs"
                    />
                  </TableHead>
                  <TableHead className="hidden lg:table-cell px-2 sm:px-4 py-2 sm:py-3"></TableHead>
                  <TableHead className="px-2 sm:px-4 py-2 sm:py-3"></TableHead>
                  {showCreatedBy && (
                    <TableHead className="hidden xl:table-cell px-2 sm:px-4 py-2 sm:py-3">
                      <Input
                        placeholder="Filter..."
                        value={filters.creator}
                        onChange={(e) =>
                          handleFilterChange("creator", e.target.value)
                        }
                        className="h-7 text-xs"
                      />
                    </TableHead>
                  )}
                  <TableHead className="px-2 sm:px-4 py-2 sm:py-3"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map((payment) => {
                  const config =
                    statusConfig[payment.status as keyof typeof statusConfig];

                  return (
                    <TableRow key={payment.id}>
                      <TableCell className="px-2 sm:px-4 py-2 sm:py-3 text-xs">
                        {new Date(payment.payment_date).toLocaleDateString(
                          "en-IN",
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          },
                        )}
                      </TableCell>
                      <TableCell className="px-2 sm:px-4 py-2 sm:py-3">
                        <Link
                          href={`/dashboard/invoices/${payment.invoice_id}`}
                          className="font-medium hover:underline text-blue-600 max-w-[100px] sm:max-w-none truncate block text-xs"
                        >
                          {payment.invoices.invoice_number}
                        </Link>
                      </TableCell>
                      <TableCell className="px-2 sm:px-4 py-2 sm:py-3 text-xs">
                        {payment.invoices.clients.name}
                      </TableCell>
                      <TableCell className="font-semibold text-green-600 px-2 sm:px-4 py-2 sm:py-3 text-xs">
                        ₹
                        {Number(payment.amount).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="hidden md:table-cell capitalize px-2 sm:px-4 py-2 sm:py-3 text-xs">
                        {payment.payment_method.replace("_", " ")}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground px-2 sm:px-4 py-2 sm:py-3 text-xs">
                        {payment.reference_number || "-"}
                      </TableCell>
                      <TableCell className="px-2 sm:px-4 py-2 sm:py-3">
                        <Badge
                          variant="secondary"
                          className={`${config.className} text-xs`}
                        >
                          {config.label}
                        </Badge>
                      </TableCell>
                      {showCreatedBy && (
                        <TableCell className="hidden xl:table-cell px-2 sm:px-4 py-2 sm:py-3">
                          <div className="flex flex-col">
                            <span className="text-xs font-medium">
                              {payment.profiles?.full_name || "Unknown User"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {payment.profiles?.email || "-"}
                            </span>
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                        <div className="flex justify-end gap-1 sm:gap-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/dashboard/payments/${payment.id}`}>
                              <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPaymentToDelete(payment.id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={pagination.goToPage}
            onItemsPerPageChange={setItemsPerPage}
          />
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              payment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => paymentToDelete && handleDelete(paymentToDelete)}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
