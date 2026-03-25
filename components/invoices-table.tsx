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
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import {
  Eye,
  Pencil,
  Trash2,
  Download,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useMemo, ReactNode } from "react";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { exportToCSV, exportToPDF, ExportColumn, getTimestamp } from "@/lib/export-utils";
import { Input } from "@/components/ui/input";
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

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  due_days_type?: string | null;
  status: string;
  total_amount: string;
  amount_paid: string;
  clients: {
    name: string;
    email: string;
  };
}

interface InvoicesTableProps {
  invoices: Invoice[];
  toolbarLeft?: ReactNode;
  userRole?: string;
  fromDate?: string;
  toDate?: string;
}

const statusConfig = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-800" },
  recorded: { label: "Recorded", className: "bg-blue-100 text-blue-800" },
  partially_paid: {
    label: "Partially Paid",
    className: "bg-yellow-100 text-yellow-800",
  },
  paid: { label: "Paid", className: "bg-green-100 text-green-800" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-800" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-800" },
};

export function InvoicesTable({
  invoices,
  toolbarLeft,
  userRole,
  fromDate = "",
  toDate = "",
}: InvoicesTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Pagination state
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Filter state
  const [filters, setFilters] = useState({
    invoice_number: "",
    client: "",
    status: "",
  });

  // Date range filter (by issue_date)
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
  const processedInvoices = useMemo(() => {
    let filtered = [...invoices];

    // Apply filters
    if (filters.invoice_number) {
      filtered = filtered.filter((inv) =>
        inv.invoice_number
          .toLowerCase()
          .includes(filters.invoice_number.toLowerCase()),
      );
    }
    if (filters.client) {
      filtered = filtered.filter((inv) =>
        inv.clients.name.toLowerCase().includes(filters.client.toLowerCase()),
      );
    }
    if (filters.status) {
      filtered = filtered.filter((inv) =>
        inv.status.toLowerCase().includes(filters.status.toLowerCase()),
      );
    }

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortColumn) {
          case "invoice_number":
            aVal = a.invoice_number;
            bVal = b.invoice_number;
            break;
          case "client":
            aVal = a.clients.name;
            bVal = b.clients.name;
            break;
          case "issue_date":
            aVal = new Date(a.issue_date).getTime();
            bVal = new Date(b.issue_date).getTime();
            break;
          case "due_date":
            aVal = new Date(a.due_date).getTime();
            bVal = new Date(b.due_date).getTime();
            break;
          case "total_amount":
            aVal = Number(a.total_amount);
            bVal = Number(b.total_amount);
            break;
          case "amount_paid":
            aVal = Number(a.amount_paid);
            bVal = Number(b.amount_paid);
            break;
          case "due_amount":
            aVal = Number(a.total_amount) - Number(a.amount_paid);
            bVal = Number(b.total_amount) - Number(b.amount_paid);
            break;
          case "status":
            aVal = a.status;
            bVal = b.status;
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
  }, [invoices, filters, sortColumn, sortDirection]);

  const pagination = usePagination({
    items: processedInvoices,
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

  const handleDelete = async () => {
    if (!invoiceToDelete) return;

    setIsDeleting(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", invoiceToDelete);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete invoice.",
      });
    } else {
      toast({
        variant: "success",
        title: "Invoice deleted",
        description: "The invoice has been deleted successfully.",
      });
      router.refresh();
    }

    setIsDeleting(false);
    setDeleteDialogOpen(false);
    setInvoiceToDelete(null);
  };

  const handleExport = () => {
    // Enrich invoices with due amount calculation and format due_date based on due_days_type
    const enrichedInvoices = processedInvoices.map((invoice) => ({
      ...invoice,
      due_amount: (
        Number(invoice.total_amount) - Number(invoice.amount_paid)
      ).toFixed(2),
      due_date_display:
        invoice.due_days_type === "end_of_month"
          ? "End of the billed month"
          : new Date(invoice.due_date).toLocaleDateString("en-IN", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }),
    }));

    const columns: ExportColumn[] = [
      { key: "invoice_number", label: "Invoice Number" },
      {
        key: "clients",
        label: "Client Name",
        formatter: (client) => client?.name || "",
      },
      {
        key: "issue_date",
        label: "Issue Date",
        formatter: (date) =>
          new Date(date).toLocaleDateString("en-IN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }),
      },
      {
        key: "due_date_display",
        label: "Due Date",
      },
      {
        key: "total_amount",
        label: "Total Amount",
        formatter: (amount) => Number(amount).toFixed(2),
      },
      {
        key: "amount_paid",
        label: "Amount Paid",
        formatter: (amount) => Number(amount).toFixed(2),
      },
      {
        key: "due_amount",
        label: "Due Amount",
      },
      {
        key: "status",
        label: "Status",
        formatter: (status) =>
          statusConfig[status as keyof typeof statusConfig]?.label || status,
      },
    ];

    exportToCSV(enrichedInvoices, columns, `invoices-${getTimestamp()}.csv`);
    toast({
      variant: "success",
      title: "Exported",
      description: `${enrichedInvoices.length} invoice(s) exported to CSV successfully.`,
    });
  };

  const handleExportPDF = async () => {
    const enrichedInvoices = processedInvoices.map((invoice) => ({
      ...invoice,
      client_name: invoice.clients.name,
      issue_date_fmt: new Date(invoice.issue_date).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
      due_date_display:
        invoice.due_days_type === "end_of_month"
          ? "End of billed month"
          : new Date(invoice.due_date).toLocaleDateString("en-IN", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }),
      total_fmt: `Rs.${Number(invoice.total_amount).toFixed(2)}`,
      paid_fmt: `Rs.${Number(invoice.amount_paid).toFixed(2)}`,
      due_fmt: `Rs.${(Number(invoice.total_amount) - Number(invoice.amount_paid)).toFixed(2)}`,
      status_label:
        statusConfig[invoice.status as keyof typeof statusConfig]?.label ||
        invoice.status,
    }));

    const pdfColumns: ExportColumn[] = [
      { key: "invoice_number", label: "Invoice #" },
      { key: "client_name", label: "Client" },
      { key: "issue_date_fmt", label: "Issue Date" },
      { key: "due_date_display", label: "Due Date" },
      { key: "total_fmt", label: "Total" },
      { key: "paid_fmt", label: "Paid" },
      { key: "due_fmt", label: "Due" },
      { key: "status_label", label: "Status" },
    ];

    const rangeLabel =
      fromDate || toDate
        ? ` (${fromDate || "..."} to ${toDate || "..."})`
        : "";
    await exportToPDF(
      enrichedInvoices,
      pdfColumns,
      `Invoices${rangeLabel}`,
      `invoices-${getTimestamp()}.pdf`,
    );
    toast({
      variant: "success",
      title: "Exported",
      description: `${enrichedInvoices.length} invoice(s) exported to PDF successfully.`,
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
              disabled={processedInvoices.length === 0}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">CSV</span>
            </Button>
            <Button
              onClick={handleExportPDF}
              size="sm"
              variant="outline"
              title="Export to PDF"
              disabled={processedInvoices.length === 0}
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">PDF</span>
            </Button>
          </div>
        </div>
      </div>

      {processedInvoices.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-white">
          <p className="text-muted-foreground">
            No invoices found for the selected filters.
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
                    onClick={() => handleSort("invoice_number")}
                  >
                    Invoice #<SortIcon column="invoice_number" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                    onClick={() => handleSort("client")}
                  >
                    Client
                    <SortIcon column="client" />
                  </TableHead>
                  <TableHead
                    className="hidden sm:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                    onClick={() => handleSort("issue_date")}
                  >
                    Issue Date
                    <SortIcon column="issue_date" />
                  </TableHead>
                  <TableHead
                    className="hidden md:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                    onClick={() => handleSort("due_date")}
                  >
                    Due Date
                    <SortIcon column="due_date" />
                  </TableHead>
                  <TableHead className="hidden lg:table-cell px-2 sm:px-4 py-2 sm:py-3">
                    Overdue
                  </TableHead>
                  <TableHead
                    className="hidden lg:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                    onClick={() => handleSort("total_amount")}
                  >
                    Total
                    <SortIcon column="total_amount" />
                  </TableHead>
                  <TableHead
                    className="hidden md:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                    onClick={() => handleSort("amount_paid")}
                  >
                    Paid
                    <SortIcon column="amount_paid" />
                  </TableHead>
                  <TableHead
                    className="hidden lg:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                    onClick={() => handleSort("due_amount")}
                  >
                    Due
                    <SortIcon column="due_amount" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                    onClick={() => handleSort("status")}
                  >
                    Status
                    <SortIcon column="status" />
                  </TableHead>
                  <TableHead className="text-right px-2 sm:px-4 py-2 sm:py-3">
                    Actions
                  </TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="px-2 sm:px-4 py-2 sm:py-3">
                    <Input
                      placeholder="Filter..."
                      value={filters.invoice_number}
                      onChange={(e) =>
                        handleFilterChange("invoice_number", e.target.value)
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
                  <TableHead className="hidden sm:table-cell px-2 sm:px-4 py-2 sm:py-3"></TableHead>
                  <TableHead className="hidden md:table-cell px-2 sm:px-4 py-2 sm:py-3"></TableHead>
                  <TableHead className="hidden lg:table-cell px-2 sm:px-4 py-2 sm:py-3"></TableHead>
                  <TableHead className="hidden lg:table-cell px-2 sm:px-4 py-2 sm:py-3"></TableHead>
                  <TableHead className="hidden md:table-cell px-2 sm:px-4 py-2 sm:py-3"></TableHead>
                  <TableHead className="hidden lg:table-cell px-2 sm:px-4 py-2 sm:py-3"></TableHead>
                  <TableHead className="px-2 sm:px-4 py-2 sm:py-3">
                    <Input
                      placeholder="Filter..."
                      value={filters.status}
                      onChange={(e) =>
                        handleFilterChange("status", e.target.value)
                      }
                      className="h-7 text-xs"
                    />
                  </TableHead>
                  <TableHead className="px-2 sm:px-4 py-2 sm:py-3"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map((invoice) => {
                  const config =
                    statusConfig[invoice.status as keyof typeof statusConfig];
                  const balance =
                    Number(invoice.total_amount) - Number(invoice.amount_paid);

                  // Overdue categorization
                  const dueDate = new Date(invoice.due_date);
                  const today = new Date();
                  const msInDay = 1000 * 60 * 60 * 24;
                  const daysOverdue = Math.floor(
                    (today.getTime() - dueDate.getTime()) / msInDay,
                  );
                  const isOverdue = balance > 0 && daysOverdue > 0;
                  let overdueLabel = "On time";
                  let overdueClass = "bg-emerald-100 text-emerald-800";

                  if (isOverdue) {
                    if (daysOverdue <= 7) {
                      overdueLabel = "1 week";
                      overdueClass = "bg-amber-100 text-amber-800";
                    } else if (daysOverdue <= 14) {
                      overdueLabel = "2 weeks";
                      overdueClass = "bg-orange-100 text-orange-800";
                    } else if (daysOverdue <= 21) {
                      overdueLabel = "3 weeks";
                      overdueClass = "bg-red-100 text-red-800";
                    } else {
                      overdueLabel = "3+ weeks";
                      overdueClass = "bg-red-200 text-red-900";
                    }
                  }

                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium px-2 sm:px-4 py-2 sm:py-3 max-w-[100px] sm:max-w-none truncate">
                        {invoice.invoice_number}
                      </TableCell>
                      <TableCell className="px-2 sm:px-4 py-2 sm:py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-xs sm:text-sm">
                            {invoice.clients.name}
                          </span>
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            {invoice.clients.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell px-2 sm:px-4 py-2 sm:py-3 text-xs">
                        {new Date(invoice.issue_date).toLocaleDateString(
                          "en-IN",
                          { year: "numeric", month: "2-digit", day: "2-digit" },
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell px-2 sm:px-4 py-2 sm:py-3 text-xs">
                        {invoice.due_days_type === "end_of_month" ? (
                          <span className="text-blue-600 font-semibold">
                            End of the billed month
                          </span>
                        ) : (
                          new Date(invoice.due_date).toLocaleDateString(
                            "en-IN",
                            {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                            },
                          )
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell px-2 sm:px-4 py-2 sm:py-3">
                        <Badge
                          variant="secondary"
                          className={`${overdueClass} text-xs`}
                        >
                          {overdueLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell font-medium px-2 sm:px-4 py-2 sm:py-3 text-xs">
                        ₹
                        {Number(invoice.total_amount).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-green-600 px-2 sm:px-4 py-2 sm:py-3 text-xs">
                        ₹
                        {Number(invoice.amount_paid).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell
                        className={`hidden lg:table-cell px-2 sm:px-4 py-2 sm:py-3 text-xs ${balance > 0 ? "font-semibold text-orange-600" : "text-green-600"}`}
                      >
                        ₹
                        {balance.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="px-2 sm:px-4 py-2 sm:py-3">
                        <Badge
                          variant="secondary"
                          className={`${config.className} text-xs`}
                        >
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                        <div className="flex justify-end gap-1 sm:gap-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/dashboard/invoices/${invoice.id}`}>
                              <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Link>
                          </Button>
                          {invoice.status === "draft" && (
                            <Button variant="ghost" size="sm" asChild>
                              <Link
                                href={`/dashboard/invoices/${invoice.id}/edit`}
                              >
                                <Pencil className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Link>
                            </Button>
                          )}
                          {userRole !== "accountant" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setInvoiceToDelete(invoice.id);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
                            </Button>
                          )}
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
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this
              invoice and all associated items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
