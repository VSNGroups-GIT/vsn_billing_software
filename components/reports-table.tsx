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
  sector: string
  sale: number
  todaySaleQty: number
  todaySaleValue: number
  operatorCost: number
  marginValue: number
  mediatorCharges: number
  netMarginAfterMediator: number
  marginPercent: number
  payments: number
  outstanding: number
  oldBal: number
}

interface ReportsTableProps {
  rows: ClientRow[]
  sectorRows: {
    sector: string
    sale: number
    payments: number
    operatorCost: number
    marginValue: number
    mediatorCharges: number
    netMarginAfterMediator: number
    outstanding: number
  }[]
  daysInMonth: number
  monthLabel: string
}

export function ReportsTable({ rows, sectorRows, daysInMonth, monthLabel }: ReportsTableProps) {
  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")

  // Pagination state
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Filter state
  const [filters, setFilters] = useState({ hotel: "", sector: "" })
  const [sectorFilter, setSectorFilter] = useState("")
  const [sectorSortColumn, setSectorSortColumn] = useState<string>("sale")
  const [sectorSortDirection, setSectorSortDirection] = useState<"asc" | "desc">("desc")

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
    if (filters.sector) {
      filtered = filtered.filter((r) =>
        (r.sector || "").toLowerCase().includes(filters.sector.toLowerCase()),
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
          case "sector":
            aVal = (a.sector || "").toLowerCase()
            bVal = (b.sector || "").toLowerCase()
            break
          case "sale":
            aVal = a.sale
            bVal = b.sale
            break
          case "todaySaleQty":
            aVal = a.todaySaleQty
            bVal = b.todaySaleQty
            break
          case "todaySaleValue":
            aVal = a.todaySaleValue
            bVal = b.todaySaleValue
            break
          case "payments":
            aVal = a.payments
            bVal = b.payments
            break
          case "operatorCost":
            aVal = a.operatorCost
            bVal = b.operatorCost
            break
          case "marginValue":
            aVal = a.marginValue
            bVal = b.marginValue
            break
          case "marginPercent":
            aVal = a.marginPercent
            bVal = b.marginPercent
            break
          case "netMarginAfterMediator":
            aVal = a.netMarginAfterMediator
            bVal = b.netMarginAfterMediator
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
          todaySaleQty: acc.todaySaleQty + r.todaySaleQty,
          todaySaleValue: acc.todaySaleValue + r.todaySaleValue,
          operatorCost: acc.operatorCost + r.operatorCost,
          marginValue: acc.marginValue + r.marginValue,
          mediatorCharges: acc.mediatorCharges + r.mediatorCharges,
          netMarginAfterMediator: acc.netMarginAfterMediator + r.netMarginAfterMediator,
          payments: acc.payments + r.payments,
          outstanding: acc.outstanding + r.outstanding,
        }),
        {
          oldBal: 0,
          sale: 0,
          todaySaleQty: 0,
          todaySaleValue: 0,
          operatorCost: 0,
          marginValue: 0,
          mediatorCharges: 0,
          netMarginAfterMediator: 0,
          payments: 0,
          outstanding: 0,
        },
      ),
    [processedRows],
  )

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const processedSectorRows = useMemo(() => {
    let filtered = [...sectorRows]
    if (sectorFilter.trim()) {
      const query = sectorFilter.trim().toLowerCase()
      filtered = filtered.filter((r) => r.sector.toLowerCase().includes(query))
    }
    filtered.sort((a, b) => {
      let aVal: string | number = a.sale
      let bVal: string | number = b.sale
      switch (sectorSortColumn) {
        case "sector":
          aVal = a.sector.toLowerCase()
          bVal = b.sector.toLowerCase()
          break
        case "payments":
          aVal = a.payments
          bVal = b.payments
          break
        case "operatorCost":
          aVal = a.operatorCost
          bVal = b.operatorCost
          break
        case "marginValue":
          aVal = a.marginValue
          bVal = b.marginValue
          break
        case "netMarginAfterMediator":
          aVal = a.netMarginAfterMediator
          bVal = b.netMarginAfterMediator
          break
        case "outstanding":
          aVal = a.outstanding
          bVal = b.outstanding
          break
      }
      if (aVal < bVal) return sectorSortDirection === "asc" ? -1 : 1
      if (aVal > bVal) return sectorSortDirection === "asc" ? 1 : -1
      return 0
    })
    return filtered
  }, [sectorRows, sectorFilter, sectorSortColumn, sectorSortDirection])

  const handleSectorSort = (column: string) => {
    if (sectorSortColumn === column) {
      setSectorSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSectorSortColumn(column)
      setSectorSortDirection(column === "sector" ? "asc" : "desc")
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table className="text-xs sm:text-sm min-w-[1200px]">
          <TableHeader>
            {/* Column headers — sortable */}
            <TableRow>
              <TableHead
                className="sticky left-0 z-20 bg-white border-r px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50 min-w-[180px] w-[180px]"
                onClick={() => handleSort("hotel")}
              >
                Clients <SortIcon column="hotel" />
              </TableHead>
              <TableHead
                className="px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("sector")}
              >
                Sector <SortIcon column="sector" />
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
                onClick={() => handleSort("todaySaleQty")}
              >
                Today's sale - Qty <SortIcon column="todaySaleQty" />
              </TableHead>
              <TableHead
                className="text-right px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("todaySaleValue")}
              >
                Today's sale - Value <SortIcon column="todaySaleValue" />
              </TableHead>
              <TableHead
                className="text-right px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("payments")}
              >
                Net Payments <SortIcon column="payments" />
              </TableHead>
              <TableHead
                className="text-right px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("operatorCost")}
              >
                Operator Cost <SortIcon column="operatorCost" />
              </TableHead>
              <TableHead
                className="text-right px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("marginValue")}
              >
                Margin ₹ <SortIcon column="marginValue" />
              </TableHead>
              <TableHead
                className="text-right px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("marginPercent")}
              >
                Margin % <SortIcon column="marginPercent" />
              </TableHead>
              <TableHead
                className="text-right px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("netMarginAfterMediator")}
              >
                Net Margin After Mediator ₹ <SortIcon column="netMarginAfterMediator" />
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
              <TableHead className="sticky left-0 z-20 bg-white border-r px-2 sm:px-4 py-1.5 min-w-[180px] w-[180px]">
                <Input
                  placeholder="Filter clients…"
                  value={filters.hotel}
                  onChange={(e) => handleFilterChange("hotel", e.target.value)}
                  className="h-7 text-xs font-normal"
                />
              </TableHead>
              <TableHead className="px-2 sm:px-4 py-1.5">
                <Input
                  placeholder="Filter sector…"
                  value={filters.sector}
                  onChange={(e) => handleFilterChange("sector", e.target.value)}
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
                Current day qty
              </TableHead>
              <TableHead className="text-right px-2 sm:px-4 py-1.5 font-normal text-muted-foreground text-xs">
                Current day sale value
              </TableHead>
              <TableHead className="text-right px-2 sm:px-4 py-1.5 font-normal text-muted-foreground text-xs">
                Current month net receipts
              </TableHead>
              <TableHead className="text-right px-2 sm:px-4 py-1.5 font-normal text-muted-foreground text-xs">
                Estimated monthly cost
              </TableHead>
              <TableHead className="text-right px-2 sm:px-4 py-1.5 font-normal text-muted-foreground text-xs">
                Sale - cost
              </TableHead>
              <TableHead className="text-right px-2 sm:px-4 py-1.5 font-normal text-muted-foreground text-xs">
                (Margin ₹ / Sale) × 100
              </TableHead>
              <TableHead className="text-right px-2 sm:px-4 py-1.5 font-normal text-muted-foreground text-xs">
                Margin ₹ - mediator charges
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
                  colSpan={12}
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
                  <TableCell className="sticky left-0 z-10 bg-white border-r font-medium px-2 sm:px-4 py-2 sm:py-3 min-w-[180px] w-[180px] whitespace-nowrap">
                    {row.name}
                  </TableCell>
                  <TableCell className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                    {row.sector || "Uncategorized"}
                  </TableCell>
                  <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                    {row.oldBal > 0 ? `₹${fmt(row.oldBal)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                    {row.sale > 0 ? `₹${fmt(row.sale)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                    {row.todaySaleQty > 0 ? row.todaySaleQty.toFixed(2) : "—"}
                  </TableCell>
                  <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                    {row.todaySaleValue > 0 ? `₹${fmt(row.todaySaleValue)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3 text-green-700">
                    {row.payments > 0 ? `₹${fmt(row.payments)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3 text-slate-700">
                    {row.operatorCost > 0 ? `₹${fmt(row.operatorCost)}` : "—"}
                  </TableCell>
                  <TableCell className={`text-right px-2 sm:px-4 py-2 sm:py-3 font-semibold ${row.marginValue < 0 ? "text-red-700" : "text-blue-700"}`}>
                    {row.marginValue !== 0 ? `₹${fmt(row.marginValue)}` : "—"}
                  </TableCell>
                  <TableCell className={`text-right px-2 sm:px-4 py-2 sm:py-3 font-semibold ${row.marginPercent < 0 ? "text-red-700" : "text-blue-700"}`}>
                    {row.sale > 0 ? `${row.marginPercent.toFixed(2)}%` : "—"}
                  </TableCell>
                  <TableCell className={`text-right px-2 sm:px-4 py-2 sm:py-3 font-semibold ${row.netMarginAfterMediator < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {row.netMarginAfterMediator !== 0 ? `₹${fmt(row.netMarginAfterMediator)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3 font-semibold text-orange-700">
                    {row.outstanding > 0 ? `₹${fmt(row.outstanding)}` : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}

            {/* Totals row — based on all filtered rows (not just current page) */}
            {processedRows.length > 0 && (
              <TableRow className="border-t-2 font-bold bg-muted">
                <TableCell className="sticky left-0 z-30 bg-muted border-r px-2 sm:px-4 py-2 sm:py-3 min-w-[180px] w-[180px] whitespace-nowrap">
                  Total Sale
                </TableCell>
                <TableCell className="px-2 sm:px-4 py-2 sm:py-3">—</TableCell>
                <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                  ₹{fmt(totals.oldBal)}
                </TableCell>
                <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                  ₹{fmt(totals.sale)}
                </TableCell>
                <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                  {totals.todaySaleQty > 0 ? totals.todaySaleQty.toFixed(2) : "0"}
                </TableCell>
                <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
                  ₹{fmt(totals.todaySaleValue)}
                </TableCell>
                <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3 text-green-700">
                  ₹{fmt(totals.payments)}
                </TableCell>
                <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3 text-slate-700">
                  ₹{fmt(totals.operatorCost)}
                </TableCell>
                <TableCell className={`text-right px-2 sm:px-4 py-2 sm:py-3 ${totals.marginValue < 0 ? "text-red-700" : "text-blue-700"}`}>
                  ₹{fmt(totals.marginValue)}
                </TableCell>
                <TableCell className={`text-right px-2 sm:px-4 py-2 sm:py-3 ${totals.sale > 0 && totals.marginValue / totals.sale < 0 ? "text-red-700" : "text-blue-700"}`}>
                  {totals.sale > 0 ? `${((totals.marginValue / totals.sale) * 100).toFixed(2)}%` : "—"}
                </TableCell>
                <TableCell className={`text-right px-2 sm:px-4 py-2 sm:py-3 ${totals.netMarginAfterMediator < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  ₹{fmt(totals.netMarginAfterMediator)}
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

      <div className="rounded-lg border bg-white overflow-x-auto">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Sector-wise Summary</h3>
          <p className="text-xs text-muted-foreground">
            Aggregated profits and transaction values by sector.
          </p>
        </div>
        <div className="p-4 border-b">
          <Input
            placeholder="Filter sectors..."
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="h-8 max-w-xs"
          />
        </div>
        <Table className="text-xs sm:text-sm min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSectorSort("sector")}>
                Sector
              </TableHead>
              <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSectorSort("sale")}>
                Sale
              </TableHead>
              <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSectorSort("payments")}>
                Net Payments
              </TableHead>
              <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSectorSort("operatorCost")}>
                Operator Cost
              </TableHead>
              <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSectorSort("marginValue")}>
                Margin
              </TableHead>
              <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSectorSort("netMarginAfterMediator")}>
                Net Margin After Mediator
              </TableHead>
              <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSectorSort("outstanding")}>
                Outstanding
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedSectorRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  No sector summary data found.
                </TableCell>
              </TableRow>
            ) : (
              processedSectorRows.map((row) => (
                <TableRow key={row.sector}>
                  <TableCell className="font-medium">{row.sector}</TableCell>
                  <TableCell className="text-right">₹{fmt(row.sale)}</TableCell>
                  <TableCell className="text-right text-green-700">₹{fmt(row.payments)}</TableCell>
                  <TableCell className="text-right text-slate-700">₹{fmt(row.operatorCost)}</TableCell>
                  <TableCell className={`text-right font-semibold ${row.marginValue < 0 ? "text-red-700" : "text-blue-700"}`}>
                    ₹{fmt(row.marginValue)}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${row.netMarginAfterMediator < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    ₹{fmt(row.netMarginAfterMediator)}
                  </TableCell>
                  <TableCell className="text-right text-orange-700">₹{fmt(row.outstanding)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
