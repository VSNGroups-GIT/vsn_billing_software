"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Eye, FileText, Pencil, Trash2 } from "lucide-react";
import { exportToCSVAsync, exportToPDF, type ExportColumn, getTimestamp } from "@/lib/export-utils";

interface Quotation {
  id: string;
  quotation_number: string;
  quotation_type: "whatsapp" | "other";
  issue_date: string;
  due_date: string;
  status: string;
  total_amount: string;
  converted_invoice_id: string | null;
  clients: {
    name: string;
    email: string;
  };
  profiles?: {
    full_name: string | null;
    email: string | null;
  } | null;
}

interface QuotationsTableProps {
  quotations: Quotation[];
  userRole?: string;
  toolbarLeft?: ReactNode;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-800" },
  recorded: { label: "Recorded", className: "bg-blue-100 text-blue-800" },
  converted: { label: "Converted", className: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800" },
};

export function QuotationsTable({ quotations, userRole, toolbarLeft }: QuotationsTableProps) {
  const showCreatedBy = userRole === "super_admin";
  const router = useRouter();
  const { toast } = useToast();
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [filters, setFilters] = useState({ quotation: "", client: "", status: "", creator: "" });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const processed = useMemo(() => {
    let rows = [...quotations];

    if (filters.quotation) {
      rows = rows.filter((q) =>
        q.quotation_number.toLowerCase().includes(filters.quotation.toLowerCase()),
      );
    }
    if (filters.client) {
      rows = rows.filter((q) =>
        q.clients.name.toLowerCase().includes(filters.client.toLowerCase()),
      );
    }
    if (filters.status) {
      rows = rows.filter((q) => q.status.toLowerCase().includes(filters.status.toLowerCase()));
    }
    if (filters.creator) {
      const creatorQuery = filters.creator.toLowerCase();
      rows = rows.filter((q) => {
        const creatorName = q.profiles?.full_name?.toLowerCase() || "";
        const creatorEmail = q.profiles?.email?.toLowerCase() || "";
        return creatorName.includes(creatorQuery) || creatorEmail.includes(creatorQuery);
      });
    }

    if (sortColumn) {
      rows.sort((a, b) => {
        let va: string | number = "";
        let vb: string | number = "";

        switch (sortColumn) {
          case "quotation_number":
            va = a.quotation_number;
            vb = b.quotation_number;
            break;
          case "client":
            va = a.clients.name;
            vb = b.clients.name;
            break;
          case "issue_date":
            va = new Date(a.issue_date).getTime();
            vb = new Date(b.issue_date).getTime();
            break;
          case "total":
            va = Number(a.total_amount);
            vb = Number(b.total_amount);
            break;
          case "status":
            va = a.status;
            vb = b.status;
            break;
          case "creator":
            va = a.profiles?.full_name || a.profiles?.email || "";
            vb = b.profiles?.full_name || b.profiles?.email || "";
            break;
        }

        if (va < vb) return sortDirection === "asc" ? -1 : 1;
        if (va > vb) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return rows;
  }, [quotations, filters, sortColumn, sortDirection]);

  const pagination = usePagination({ items: processed, itemsPerPage });

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-2 h-4 w-4 inline opacity-40" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-2 h-4 w-4 inline" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4 inline" />
    );
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const handleExportCSV = async () => {
    if (processed.length === 0) return;

    const rows = processed.map((q) => ({
      quotation_number: q.quotation_number,
      client: q.clients.name,
      type: q.quotation_type === "whatsapp" ? "WhatsApp" : "Other",
      issue_date: new Date(q.issue_date).toLocaleDateString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit" }),
      total_amount: Number(q.total_amount).toFixed(2),
      status: statusConfig[q.status]?.label || q.status,
      created_by: q.profiles?.full_name || q.profiles?.email || "-",
    }));

    const columns: ExportColumn[] = [
      { key: "quotation_number", label: "Quotation #" },
      { key: "client", label: "Client" },
      { key: "type", label: "Type" },
      { key: "issue_date", label: "Date" },
      { key: "total_amount", label: "Total Amount" },
      { key: "status", label: "Status" },
      { key: "created_by", label: "Created By" },
    ];

    await exportToCSVAsync(rows, columns, `quotations-${getTimestamp()}.csv`);
    toast({ variant: "success", title: "Exported", description: `${rows.length} quotation(s) exported to CSV successfully.` });
  };

  const handleExportPDF = async () => {
    if (processed.length === 0) return;

    const rows = processed.map((q) => ({
      quotation_number: q.quotation_number,
      client: q.clients.name,
      type: q.quotation_type === "whatsapp" ? "WhatsApp" : "Other",
      issue_date: new Date(q.issue_date).toLocaleDateString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit" }),
      total_amount: `Rs.${Number(q.total_amount).toFixed(2)}`,
      status: statusConfig[q.status]?.label || q.status,
      created_by: q.profiles?.full_name || q.profiles?.email || "-",
    }));

    const columns: ExportColumn[] = [
      { key: "quotation_number", label: "Quotation #" },
      { key: "client", label: "Client" },
      { key: "type", label: "Type" },
      { key: "issue_date", label: "Date" },
      { key: "total_amount", label: "Total" },
      { key: "status", label: "Status" },
      { key: "created_by", label: "Created By" },
    ];

    await exportToPDF(rows, columns, "Quotations", `quotations-${getTimestamp()}.pdf`);
    toast({ variant: "success", title: "Exported", description: `${rows.length} quotation(s) exported to PDF successfully.` });
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    setIsDeleting(true);
    const supabase = createClient();

    const { error } = await supabase.from("quotations").delete().eq("id", deletingId);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete quotation" });
    } else {
      toast({ variant: "success", title: "Deleted", description: "Quotation deleted" });
      router.refresh();
    }

    setIsDeleting(false);
    setDeleteDialogOpen(false);
    setDeletingId(null);
  };

  const colSpan = showCreatedBy ? 8 : 7;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-2">{toolbarLeft}</div>
        <div className="flex gap-2">
          <Button
            onClick={handleExportCSV}
            size="sm"
            variant="outline"
            title="Export to CSV"
            disabled={processed.length === 0}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline ml-2">CSV</span>
          </Button>
          <Button
            onClick={handleExportPDF}
            size="sm"
            variant="outline"
            title="Export to PDF"
            disabled={processed.length === 0}
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline ml-2">PDF</span>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table className="text-xs sm:text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => handleSort("quotation_number")}>
                Quotation # <SortIcon column="quotation_number" />
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("client")}>
                Client <SortIcon column="client" />
              </TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("issue_date")}>
                Date <SortIcon column="issue_date" />
              </TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("total")}>
                Total <SortIcon column="total" />
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("status")}>
                Status <SortIcon column="status" />
              </TableHead>
              {showCreatedBy && (
                <TableHead className="hidden xl:table-cell cursor-pointer" onClick={() => handleSort("creator")}>
                  Created By <SortIcon column="creator" />
                </TableHead>
              )}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>

            <TableRow>
              <TableHead>
                <Input
                  className="h-7 text-xs"
                  placeholder="Filter..."
                  value={filters.quotation}
                  onChange={(e) => setFilters((p) => ({ ...p, quotation: e.target.value }))}
                />
              </TableHead>
              <TableHead>
                <Input
                  className="h-7 text-xs"
                  placeholder="Filter..."
                  value={filters.client}
                  onChange={(e) => setFilters((p) => ({ ...p, client: e.target.value }))}
                />
              </TableHead>
              <TableHead />
              <TableHead />
              <TableHead />
              <TableHead>
                <Input
                  className="h-7 text-xs"
                  placeholder="Filter..."
                  value={filters.status}
                  onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                />
              </TableHead>
              {showCreatedBy && (
                <TableHead className="hidden xl:table-cell">
                  <Input
                    className="h-7 text-xs"
                    placeholder="Filter..."
                    value={filters.creator}
                    onChange={(e) => setFilters((p) => ({ ...p, creator: e.target.value }))}
                  />
                </TableHead>
              )}
              <TableHead />
            </TableRow>
          </TableHeader>

          <TableBody>
            {pagination.paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-12">
                  No quotations found.
                </TableCell>
              </TableRow>
            ) : (
              pagination.paginatedItems.map((q) => {
                const cfg = statusConfig[q.status] || { label: q.status, className: "" };
                return (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{q.quotation_number}</TableCell>
                    <TableCell>{q.clients.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {q.quotation_type === "whatsapp" ? "WhatsApp" : "Other"}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(q.issue_date).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell className="text-right">Rs. {Number(q.total_amount).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className={cfg.className}>{cfg.label}</Badge>
                    </TableCell>
                    {showCreatedBy && (
                      <TableCell className="hidden xl:table-cell">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">
                            {q.profiles?.full_name || "Unknown User"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {q.profiles?.email || "-"}
                          </span>
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" asChild title="View">
                          <Link href={`/dashboard/quotations/${q.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>

                        {q.status !== "converted" && (
                          <Button size="sm" variant="ghost" asChild title="Edit">
                            <Link href={`/dashboard/quotations/${q.id}/edit`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}

                        {!q.converted_invoice_id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Delete"
                            onClick={() => {
                              setDeletingId(q.id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
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
            <AlertDialogTitle>Delete quotation?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Converted quotations cannot be deleted.
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
