"use client"

import { useState, useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { usePagination } from "@/hooks/use-pagination"
import { TablePagination } from "@/components/table-pagination"

type ClientRow = {
  id: string
  name: string
  sale: number
  saleKgs: number
  payments: number
  outstanding: number
  oldBal: number
}

interface ReportsTableProps {
  rows: ClientRow[]
  daysInMonth: number
  monthLabel: string
}

export function ReportsTable({ rows, daysInMonth, monthLabel }: ReportsTableProps) {
  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")

  // Pagination state
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Filter state
  const [filters, setFilters] = useState({ hotel: "" })

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const handleFilterChange = (column: string, value: string) => {
    setFilters((prev) => ({ ...prev, [column]: value }))
  }

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column)
      return <ArrowUpDown className="ml-2 h-4 w-4 inline opacity-40" />
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-2 h-4 w-4 inline" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4 inline" />
    )
  }

  const processedRows = useMemo(() => {
    let filtered = [...rows]

    if (filters.hotel) {
      filtered = filtered.filter((r) =>
        r.name.toLowerCase().includes(filters.hotel.toLowerCase()),
      )
    }

    if (sortColumn) {
      filtered.sort((a, b) => {
        let aVal: any
        let bVal: any

        switch (sortColumn) {
          case "hotel":
            aVal = a.name.toLowerCase()
            bVal = b.name.toLowerCase()
            break
          case "oldBal":
            aVal = a.oldBal
            bVal = b.oldBal
            break
          case "sale":
            aVal = a.sale
            bVal = b.sale
            break
          case "saleKgs":
            aVal = a.saleKgs
            bVal = b.saleKgs
            break
          case "avgQty":
            aVal = a.saleKgs / daysInMonth
            bVal = b.saleKgs / daysInMonth
            break
          case "payments":
            aVal = a.payments
            bVal = b.payments
            break
          case "outstanding":
            aVal = a.outstanding
            bVal = b.outstanding
            break
          default:
            return 0
        }

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1
        return 0
      })
    }

    return filtered
  }, [rows, filters, sortColumn, sortDirection, daysInMonth])

  const pagination = usePagination({ items: processedRows, itemsPerPage })

  const totals = useMemo(
    () =>
      processedRows.reduce(
        (acc, r) => ({
          oldBal: acc.oldBal + r.oldBal,
          sale: acc.sale + r.sale,
          saleKgs: acc.saleKgs + r.saleKgs,
          payments: acc.payments + r.payments,
          outstanding: acc.outstanding + r.outstanding,
        }),
        { oldBal: 0, sale: 0, saleKgs: 0, payments: 0, outstanding: 0 },
      ),
    [processedRows],
  )

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table className="text-xs sm:text-sm">
          <TableHeader>
            {/* Column headers — sortable */}
            <TableRow>
              <TableHead
                className="px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("hotel")}
              >
                Clients <SortIcon column="hotel" />
              </TableHead>
              <TableHead
                className="text-right px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("oldBal")}
              >
                Old balance <SortIcon column="oldBal" />
              </TableHead>
              <TableHead
                className="text-right px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("sale")}
              >
                Sale <SortIcon column="sale" />
              </TableHead>
              <TableHead
                className="text-right px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("saleKgs")}
              >
                Sale in KGs <SortIcon column="saleKgs" />
              </TableHead>
              <TableHead
                className="text-right px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("avgQty")}
              >
                Average quantity <SortIcon column="avgQty" />
              </TableHead>
              <TableHead
                className="text-right px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("payments")}
              >
                Payments <SortIcon column="payments" />
              </TableHead>
              <TableHead
                className="text-right px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("outstanding")}
              >
                Outstanding <SortIcon column="outstanding" />
              </TableHead>
            </TableRow>

            {/* Filter / sub-header row */}
            <TableRow>
              <TableHead className="px-2 sm:px-4 py-1.5">
                <Input
                  placeholder="Filter clients…"
                  value={filters.hotel}
                  onChange={(e) => handleFilterChange("hotel", e.target.value)}
                  className="h-7 text-xs font-normal"
                />
              </TableHead>
              <TableHead className="text-right px-2 sm:px-4 py-1.5 font-normal text-muted-foreground text-xs">
                Outstanding - Current month Sale
              </TableHead>
              <TableHead className="text-right px-2 sm:px-4 py-1.5 font-normal text-muted-foreground text-xs">
                Current month sale
              </TableHead>
              <TableHead className="text-right px-2 sm:px-4 py-1.5 font-normal text-muted-foreground text-xs">
                Total purchased quantity 
              </TableHead>
              <TableHead className="text-right px-2 sm:px-4 py-1.5 font-normal text-muted-foreground leading-tight text-xs">
                Average quantity per day
                <br />
                Total / {daysInMonth} days
              </TableHead>
              <TableHead className="text-right px-2 sm:px-4 py-1.5 font-normal text-muted-foreground text-xs">
                Current month payments
              </TableHead>
              <TableHead className="text-right px-2 sm:px-4 py-1.5 font-normal text-muted-foreground text-xs">
                Total outstanding
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {pagination.paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-16 px-2 sm:px-4"
                >
                  {filters.hotel
                    ? `No hotels matching "${filters.hotel}".`
                    : `No activity found for ${monthLabel}.`}
                </TableCell>
              </TableRow>
            ) : (
              pagination.paginatedItems.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium px-2 sm:px-4 py-2 sm:py-3">
                    {row.name}
                  </TableCell>
                  <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                    {row.oldBal > 0 ? `₹${fmt(row.oldBal)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                    {row.sale > 0 ? `₹${fmt(row.sale)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                    {row.saleKgs > 0 ? row.saleKgs.toFixed(2) : "—"}
                  </TableCell>
                  <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                    {row.saleKgs > 0 ? (
                      <>
                        {(row.saleKgs / daysInMonth).toFixed(2)}
                        {/* <span className="text-muted-foreground ml-1">/ {daysInMonth}d</span> */}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3 text-green-700">
                    {row.payments > 0 ? `₹${fmt(row.payments)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3 font-semibold text-orange-700">
                    {row.outstanding > 0 ? `₹${fmt(row.outstanding)}` : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}

            {/* Totals row — based on all filtered rows (not just current page) */}
            {processedRows.length > 0 && (
              <TableRow className="border-t-2 font-bold bg-muted/30">
                <TableCell className="px-2 sm:px-4 py-2 sm:py-3">Total Sale</TableCell>
                <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                  ₹{fmt(totals.oldBal)}
                </TableCell>
                <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                  ₹{fmt(totals.sale)}
                </TableCell>
                <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                  {totals.saleKgs > 0 ? totals.saleKgs.toFixed(2) : "0"}
                </TableCell>
                <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3 font-normal text-muted-foreground">
                  —
                </TableCell>
                <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3 text-green-700">
                  ₹{fmt(totals.payments)}
                </TableCell>
                <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3 text-orange-700">
                  ₹{fmt(totals.outstanding)}
                </TableCell>
              </TableRow>
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
    </div>
  )
}
