"use client";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Trash2, Download, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { exportToCSV, ExportColumn, getTimestamp } from "@/lib/export-utils";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/table-pagination";

interface OperatorPayment {
  id: string;
  amount: string;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  status: string;
  notes: string | null;
  operator_invoices: {
    id: string;
    invoice_number: string;
    total_amount: string;
    operators: { name: string } | null;
  } | null;
}

interface OperatorPaymentsTableProps {
  payments: OperatorPayment[];
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
  refunded: { label: "Refunded", className: "bg-slate-100 text-slate-800" },
};

const methodLabels: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  check: "Cheque",
  credit_card: "Credit Card",
  other: "Other",
};

type SortKey = "payment_date" | "amount" | "payment_method" | "status";

export function OperatorPaymentsTable({ payments }: OperatorPaymentsTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortKey, setSortKey] = useState<SortKey>("payment_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const formatCurrency = (val: string | number) =>
    `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const filtered = useMemo(() => {
    const q = filterText.toLowerCase();
    return payments.filter(
      (p) =>
        (p.operator_invoices?.invoice_number || "").toLowerCase().includes(q) ||
        (p.operator_invoices?.operators?.name || "").toLowerCase().includes(q) ||
        (p.reference_number || "").toLowerCase().includes(q),
    );
  }, [payments, filterText]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va: string | number = "", vb: string | number = "";
      switch (sortKey) {
        case "payment_date": va = a.payment_date; vb = b.payment_date; break;
        case "amount": va = Number(a.amount); vb = Number(b.amount); break;
        case "payment_method": va = a.payment_method; vb = b.payment_method; break;
        case "status": va = a.status; vb = b.status; break;
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const pagination = usePagination({
    items: sorted,
    itemsPerPage,
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" /> :
    sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    const supabase = createClient();

    // Get payment to reverse amount_paid
    const { data: payment } = await supabase
      .from("operator_payments")
      .select("amount, operator_invoice_id")
      .eq("id", id)
      .single();

    const { error } = await supabase.from("operator_payments").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete payment." });
    } else {
      // Recalculate invoice amount_paid
      if (payment) {
        const { data: inv } = await supabase
          .from("operator_invoices")
          .select("amount_paid, total_amount")
          .eq("id", payment.operator_invoice_id)
          .single();
        if (inv) {
          const newPaid = Math.max(0, Number(inv.amount_paid) - Number(payment.amount));
          const newStatus =
            newPaid >= Number(inv.total_amount) - 0.01
              ? "paid"
              : newPaid > 0
                ? "partially_paid"
                : "unpaid";
          await supabase
            .from("operator_invoices")
            .update({ amount_paid: newPaid, status: newStatus })
            .eq("id", payment.operator_invoice_id);
        }
      }
      toast({ variant: "success", title: "Deleted", description: "Payment removed and invoice balance updated." });
      router.refresh();
    }
    setIsDeleting(false);
    setDeleteDialogOpen(false);
  };

  const handleExport = () => {
    const columns: ExportColumn[] = [
      { key: "operator_invoices", label: "Operator", formatter: (v) => (v as { operators: { name: string } | null } | null)?.operators?.name || "" },
      { key: "operator_invoices", label: "Invoice No.", formatter: (v) => (v as { invoice_number: string } | null)?.invoice_number || "" },
      { key: "amount", label: "Amount" },
      { key: "payment_date", label: "Date" },
      { key: "payment_method", label: "Method", formatter: (v) => methodLabels[v as string] || String(v) },
      { key: "reference_number", label: "Reference", formatter: (v) => v || "" },
      { key: "status", label: "Status" },
    ];
    exportToCSV(payments, columns, `operator-payments-${getTimestamp()}.csv`);
    toast({ variant: "success", title: "Exported" });
  };

  if (payments.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-white">
        <p className="text-muted-foreground">No operator payments found.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2 mb-4 items-start sm:items-center justify-between">
        <Input
          placeholder="Search by operator, invoice, reference..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="max-w-xs text-sm h-9"
        />
        <Button onClick={handleExport} size="sm" variant="outline">
          <Download className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table className="text-xs sm:text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Operator</TableHead>
              <TableHead>Invoice No.</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("payment_date")}>
                <span className="flex items-center">Date <SortIcon k="payment_date" /></span>
              </TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("amount")}>
                <span className="flex items-center justify-end">Amount <SortIcon k="amount" /></span>
              </TableHead>
              <TableHead className="hidden sm:table-cell cursor-pointer" onClick={() => handleSort("payment_method")}>
                <span className="flex items-center">Method <SortIcon k="payment_method" /></span>
              </TableHead>
              <TableHead className="hidden md:table-cell">Reference</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("status")}>
                <span className="flex items-center">Status <SortIcon k="status" /></span>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedItems.map((payment) => {
              const cfg = statusConfig[payment.status] ?? { label: payment.status, className: "" };
              return (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">{payment.operator_invoices?.operators?.name || "-"}</TableCell>
                  <TableCell>{payment.operator_invoices?.invoice_number || "-"}</TableCell>
                  <TableCell>{new Date(payment.payment_date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(payment.amount)}</TableCell>
                  <TableCell className="hidden sm:table-cell">{methodLabels[payment.payment_method] || payment.payment_method}</TableCell>
                  <TableCell className="hidden md:table-cell">{payment.reference_number || "-"}</TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${cfg.className}`}>{cfg.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setDeleteId(payment.id); setDeleteDialogOpen(true); }}
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
                    </Button>
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the payment and reverse the balance on the operator invoice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
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
