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
import {
  Pencil,
  Trash2,
  Mail,
  Phone,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
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
import { exportToCSVAsync, ExportColumn, getTimestamp } from "@/lib/export-utils";
import { Input } from "@/components/ui/input";

interface Client {
  id: string;
  name: string;
  email: string;
  tax_id?: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  created_at: string;
  due_days?: number | null;
  due_days_type?: string | null;
  profiles?: {
    full_name: string;
  };
}

interface ClientsTableProps {
  clients: Client[];
  userRole?: string;
}

export function ClientsTable({ clients, userRole }: ClientsTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Pagination state
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Filter state
  const [filters, setFilters] = useState({
    name: "",
    email: "",
    tax_id: "",
    city: "",
  });

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
  const processedClients = useMemo(() => {
    let filtered = [...clients];

    // Apply filters
    if (filters.name) {
      filtered = filtered.filter((c) =>
        c.name.toLowerCase().includes(filters.name.toLowerCase()),
      );
    }
    if (filters.email) {
      const query = filters.email.toLowerCase();
      filtered = filtered.filter((c) => {
        const emailMatch = (c.email || "").toLowerCase().includes(query);
        const phoneMatch = (c.phone || "").toLowerCase().includes(query);
        return emailMatch || phoneMatch;
      });
    }
    if (filters.tax_id) {
      filtered = filtered.filter((c) =>
        (c.tax_id || "").toLowerCase().includes(filters.tax_id.toLowerCase()),
      );
    }
    if (filters.city) {
      filtered = filtered.filter((c) =>
        (c.city || "").toLowerCase().includes(filters.city.toLowerCase()),
      );
    }

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortColumn) {
          case "name":
            aVal = a.name;
            bVal = b.name;
            break;
          case "email":
            aVal = a.email;
            bVal = b.email;
            break;
          case "city":
            aVal = a.city || "";
            bVal = b.city || "";
            break;
          case "tax_id":
            aVal = a.tax_id || "";
            bVal = b.tax_id || "";
            break;
          case "due_days":
            aVal = a.due_days || 0;
            bVal = b.due_days || 0;
            break;
          case "created_at":
            aVal = new Date(a.created_at).getTime();
            bVal = new Date(b.created_at).getTime();
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
  }, [clients, filters, sortColumn, sortDirection]);

  const pagination = usePagination({
    items: processedClients,
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

    const { error } = await supabase.from("clients").delete().eq("id", id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          "Failed to delete client. They may have associated invoices.",
      });
    } else {
      toast({
        variant: "success",
        title: "Client deleted",
        description: "The client has been deleted successfully.",
      });
      router.refresh();
    }

    setIsDeleting(false);
  };

  const handleExport = async () => {
    const columns: ExportColumn[] = [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "tax_id", label: "GST / Tax ID" },
      { key: "phone", label: "Phone" },
      { key: "address", label: "Address" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "zip_code", label: "Zip Code" },
      { key: "country", label: "Country" },
      { key: "due_days", label: "Due Days" },
      {
        key: "created_at",
        label: "Created Date",
        formatter: (date) =>
          new Date(date).toLocaleDateString("en-IN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }),
      },
    ];

    await exportToCSVAsync(processedClients, columns, `clients-${getTimestamp()}.csv`);
    toast({
      variant: "success",
      title: "Exported",
      description: `${processedClients.length} client(s) exported to CSV successfully.`,
    });
  };

  if (clients.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-white">
        <p className="text-muted-foreground">
          No clients found. Add your first client to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          onClick={handleExport}
          size="sm"
          variant="outline"
          title="Export to CSV"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table className="text-xs sm:text-sm">
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                onClick={() => handleSort("name")}
              >
                <span className="hidden sm:inline">Name</span>
                <span className="sm:hidden">Client</span>
                <SortIcon column="name" />
              </TableHead>
              <TableHead
                className="hidden sm:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                onClick={() => handleSort("email")}
              >
                Contact
                <SortIcon column="email" />
              </TableHead>
              <TableHead
                className="hidden lg:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                onClick={() => handleSort("tax_id")}
              >
                GST / Tax ID
                <SortIcon column="tax_id" />
              </TableHead>
              <TableHead
                className="hidden md:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                onClick={() => handleSort("city")}
              >
                Location
                <SortIcon column="city" />
              </TableHead>
              <TableHead
                className="hidden lg:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                onClick={() => handleSort("due_days")}
              >
                Due Payment
                <SortIcon column="due_days" />
              </TableHead>
              <TableHead
                className="hidden md:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3"
                onClick={() => handleSort("created_at")}
              >
                Created
                <SortIcon column="created_at" />
              </TableHead>
              <TableHead className="text-right px-2 sm:px-4 py-2 sm:py-3">
                Actions
              </TableHead>
            </TableRow>
            <TableRow>
              <TableHead className="px-2 sm:px-4 py-2">
                <Input
                  placeholder="Filter..."
                  value={filters.name}
                  onChange={(e) => handleFilterChange("name", e.target.value)}
                  className="h-7 text-xs"
                />
              </TableHead>
              <TableHead className="hidden sm:table-cell px-2 sm:px-4 py-2">
                <Input
                  placeholder="Filter..."
                  value={filters.email}
                  onChange={(e) => handleFilterChange("email", e.target.value)}
                  className="h-7 text-xs"
                />
              </TableHead>
              <TableHead className="hidden lg:table-cell px-2 sm:px-4 py-2">
                <Input
                  placeholder="Filter..."
                  value={filters.tax_id}
                  onChange={(e) => handleFilterChange("tax_id", e.target.value)}
                  className="h-7 text-xs"
                />
              </TableHead>
              <TableHead className="hidden md:table-cell px-2 sm:px-4 py-2">
                <Input
                  placeholder="Filter..."
                  value={filters.city}
                  onChange={(e) => handleFilterChange("city", e.target.value)}
                  className="h-7 text-xs"
                />
              </TableHead>
              <TableHead className="hidden lg:table-cell"></TableHead>
              <TableHead className="hidden md:table-cell"></TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedItems.map((client) => (
              <TableRow key={client.id} className="text-xs sm:text-sm">
                <TableCell className="font-medium px-2 sm:px-4 py-2 sm:py-3 max-w-[120px] sm:max-w-none truncate">
                  {client.name}
                </TableCell>
                <TableCell className="hidden sm:table-cell px-2 sm:px-4 py-2 sm:py-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1 text-xs sm:text-sm">
                      <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                    {client.phone && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{client.phone}</span>
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                  {client.tax_id || (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell px-2 sm:px-4 py-2 sm:py-3">
                  {client.city && client.state ? (
                    <div className="text-xs sm:text-sm">
                      {client.city}, {client.state}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                  {client.due_days_type === "end_of_month" ? (
                    <span className="font-semibold text-blue-600">
                      End of the billed month
                    </span>
                  ) : (
                    `${client.due_days ?? 0} days`
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell px-2 sm:px-4 py-2 sm:py-3 text-xs text-muted-foreground">
                  {new Date(client.created_at).toLocaleDateString("en-IN", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </TableCell>
                <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                  <div className="flex justify-end gap-1 sm:gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dashboard/clients/${client.id}/edit`}>
                        <Pencil className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setClientToDelete(client.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
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
            <AlertDialogTitle>Delete client?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              client and related references.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clientToDelete && handleDelete(clientToDelete)}
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
