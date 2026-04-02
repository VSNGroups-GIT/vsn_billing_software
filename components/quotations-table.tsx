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
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil, Trash2 } from "lucide-react";

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
  const router = useRouter();
  const { toast } = useToast();
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [filters, setFilters] = useState({ quotation: "", client: "", status: "" });
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

  const colSpan = userRole !== "admin" ? 8 : 7;

  return (
    <>
      <div className="flex items-end justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">{toolbarLeft}</div>
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
              {userRole !== "admin" && <TableHead className="text-right">Actions</TableHead>}
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
              {userRole !== "admin" && <TableHead />}
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
                    {userRole !== "admin" && (
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
                    )}
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
