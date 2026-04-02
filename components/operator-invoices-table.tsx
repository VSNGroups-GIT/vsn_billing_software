"use client";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Trash2, Download, Pencil, CreditCard, FileText, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import Link from "next/link";
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

interface OperatorInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  taxable_amount: string;
  tax_amount: string;
  total_amount: string;
  amount_paid: string;
  status: string;
  file_url: string | null;
  file_name: string | null;
  notes: string | null;
  operators: { name: string } | null;
}

interface OperatorInvoicesTableProps {
  invoices: OperatorInvoice[];
}

const statusConfig: Record<string, { label: string; className: string }> = {
  unpaid: { label: "Unpaid", className: "bg-red-100 text-red-800" },
  partially_paid: { label: "Partial", className: "bg-yellow-100 text-yellow-800" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800" },
};

type SortKey = "invoice_number" | "invoice_date" | "due_date" | "total_amount" | "amount_paid" | "status";

export function OperatorInvoicesTable({ invoices }: OperatorInvoicesTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortKey, setSortKey] = useState<SortKey>("invoice_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const formatCurrency = (val: string | number) =>
    `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const filtered = useMemo(() => {
    const q = filterText.toLowerCase();
    return invoices.filter(
      (inv) =>
        inv.invoice_number.toLowerCase().includes(q) ||
        (inv.operators?.name || "").toLowerCase().includes(q) ||
        inv.status.toLowerCase().includes(q),
    );
  }, [invoices, filterText]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va: string | number = "", vb: string | number = "";
      switch (sortKey) {
        case "invoice_number": va = a.invoice_number; vb = b.invoice_number; break;
        case "invoice_date": va = a.invoice_date; vb = b.invoice_date; break;
        case "due_date": va = a.due_date || ""; vb = b.due_date || ""; break;
        case "total_amount": va = Number(a.total_amount); vb = Number(b.total_amount); break;
        case "amount_paid": va = Number(a.amount_paid); vb = Number(b.amount_paid); break;
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
    const { error } = await supabase.from("operator_invoices").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete. Ensure no payments are linked." });
    } else {
      toast({ variant: "success", title: "Deleted", description: "Invoice removed." });
      router.refresh();
    }
    setIsDeleting(false);
    setDeleteDialogOpen(false);
  };

  const handleExport = () => {
    const columns: ExportColumn[] = [
      { key: "invoice_number", label: "Invoice No." },
      { key: "operators", label: "Operator", formatter: (v) => (v as { name: string } | null)?.name || "" },
      { key: "invoice_date", label: "Invoice Date" },
      { key: "due_date", label: "Due Date", formatter: (v) => v || "" },
      { key: "taxable_amount", label: "Taxable Amount" },
      { key: "tax_amount", label: "Tax Amount" },
      { key: "total_amount", label: "Total Amount" },
      { key: "amount_paid", label: "Amount Paid" },
      { key: "status", label: "Status" },
    ];
    exportToCSV(invoices, columns, `operator-invoices-${getTimestamp()}.csv`);
    toast({ variant: "success", title: "Exported", description: `${invoices.length} invoices exported.` });
  };

  if (invoices.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-white">
        <p className="text-muted-foreground">No operator invoices found. Add one to get started.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2 mb-4 items-start sm:items-center justify-between">
        <Input
          placeholder="Search by invoice no., operator, status..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="max-w-xs text-sm h-9"
        />
        <Button onClick={handleExport} size="sm" variant="outline" title="Export CSV">
          <Download className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table className="text-xs sm:text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => handleSort("invoice_number")}>
                <span className="flex items-center">Invoice No. <SortIcon k="invoice_number" /></span>
              </TableHead>
              <TableHead>Operator</TableHead>
              <TableHead className="cursor-pointer hidden sm:table-cell" onClick={() => handleSort("invoice_date")}>
                <span className="flex items-center">Date <SortIcon k="invoice_date" /></span>
              </TableHead>
              <TableHead className="cursor-pointer hidden md:table-cell" onClick={() => handleSort("due_date")}>
                <span className="flex items-center">Due Date <SortIcon k="due_date" /></span>
              </TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("total_amount")}>
                <span className="flex items-center justify-end">Total <SortIcon k="total_amount" /></span>
              </TableHead>
              <TableHead className="cursor-pointer text-right hidden sm:table-cell" onClick={() => handleSort("amount_paid")}>
                <span className="flex items-center justify-end">Paid <SortIcon k="amount_paid" /></span>
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("status")}>
                <span className="flex items-center">Status <SortIcon k="status" /></span>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedItems.map((inv) => {
              const balance = Number(inv.total_amount) - Number(inv.amount_paid);
              const cfg = statusConfig[inv.status] ?? { label: inv.status, className: "" };
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1">
                      {inv.file_url && <FileText className="h-3 w-3 text-slate-400 shrink-0" />}
                      {inv.invoice_number}
                    </div>
                  </TableCell>
                  <TableCell>{inv.operators?.name || "-"}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {new Date(inv.invoice_date).toLocaleDateString("en-IN")}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-IN") : "-"}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(inv.total_amount)}</TableCell>
                  <TableCell className="text-right hidden sm:table-cell text-green-700">{formatCurrency(inv.amount_paid)}</TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${cfg.className}`}>{cfg.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {balance > 0 && (
                        <Button variant="ghost" size="sm" asChild title="Record Payment">
                          <Link href={`/dashboard/operators/invoices/${inv.id}?pay=1`}>
                            <CreditCard className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
                          </Link>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" asChild title="View / Edit">
                        <Link href={`/dashboard/operators/invoices/${inv.id}`}>
                          <Pencil className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Link>
                      </Button>
                      {inv.file_url && (
                        <Button variant="ghost" size="sm" asChild title="Download PDF">
                          <a href={inv.file_url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600" />
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Delete"
                        onClick={() => { setDeleteId(inv.id); setDeleteDialogOpen(true); }}
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete operator invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this invoice. Any linked payments must be deleted first.
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
