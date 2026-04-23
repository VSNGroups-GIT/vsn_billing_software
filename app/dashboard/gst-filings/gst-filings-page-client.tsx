"use client";

import { useMemo, useState } from "react";
import { ClientSelector } from "@/components/client-selector";
import {
  FinancialYearSelector,
  getFinancialYear,
  getFinancialYearDateRange,
} from "@/components/financial-year-selector";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TablePagination } from "@/components/table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { exportToCSV, exportToPDF, type ExportColumn, getTimestamp } from "@/lib/export-utils";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileText, FilterX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Client {
  id: string;
  name: string;
}

interface RawInvoice {
  id: string;
  client_id: string;
  invoice_number: string;
  issue_date: string;
  subtotal: string | number;
  tax_amount: string | number;
  total_amount: string | number;
  gst_percent: string | number | null;
  split_gst: boolean | null;
  clients: {
    name: string;
    tax_id: string | null;
  } | null;
  invoice_items:
    | Array<{
        line_total: string | number | null;
        products: {
          hsn_code: string | null;
        } | null;
      }>
    | null;
  payments:
    | Array<{
        tds_amount: string | number | null;
      }>
    | null;
}

interface GstRow {
  id: string;
  date: string;
  invoiceNumber: string;
  clientName: string;
  clientGstin: string;
  hsnCode: string;
  ratePercent: number;
  transactionValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
  tdsAmount: number;
}

interface GstFilingsPageClientProps {
  clients: Client[];
  invoices: RawInvoice[];
}

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

const formatNumber = (value: number) =>
  value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function GstFilingsPageClient({ clients, invoices }: GstFilingsPageClientProps) {
  const { toast } = useToast();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedFY, setSelectedFY] = useState<string>(getFinancialYear());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortColumn, setSortColumn] = useState<string | null>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [filters, setFilters] = useState({
    invoice: "",
    client: "",
    gstin: "",
    hsn: "",
  });

  const filteredSourceInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (selectedClientId && invoice.client_id !== selectedClientId) return false;

      const clientTaxId = (invoice.clients?.tax_id || "").trim();
      if (!clientTaxId || clientTaxId.toLowerCase().startsWith("no gst")) return false;

      const { start, end } = getFinancialYearDateRange(selectedFY);
      if (invoice.issue_date < start || invoice.issue_date > end) return false;

      if (fromDate && invoice.issue_date < fromDate) return false;
      if (toDate && invoice.issue_date > toDate) return false;

      return true;
    });
  }, [invoices, selectedClientId, selectedFY, fromDate, toDate]);

  const processedRows = useMemo(() => {
    const rows = filteredSourceInvoices.map((invoice, index) => {
      const subtotal = Number(invoice.subtotal || 0);
      const taxAmount = Number(invoice.tax_amount || 0);
      const totalAmount = Number(invoice.total_amount || 0);

      const itemTransactionValue = (invoice.invoice_items || []).reduce(
        (sum, item) => sum + Number(item.line_total || 0),
        0,
      );
      const transactionValue = subtotal > 0 ? subtotal : itemTransactionValue;

      const ratePercent =
        Number(invoice.gst_percent || 0) > 0
          ? Number(invoice.gst_percent || 0)
          : transactionValue > 0
            ? (taxAmount / transactionValue) * 100
            : 0;

      const split = Boolean(invoice.split_gst);
      const cgst = split ? taxAmount / 2 : 0;
      const sgst = split ? taxAmount / 2 : 0;
      const igst = split ? 0 : taxAmount;

      const hsnSet = new Set<string>();
      (invoice.invoice_items || []).forEach((item) => {
        const value = item.products?.hsn_code?.trim();
        if (value) {
          hsnSet.add(value);
        }
      });

      const tdsAmount = (invoice.payments || []).reduce(
        (sum, payment) => sum + Number(payment.tds_amount || 0),
        0,
      );

      return {
        id: invoice.id,
        date: invoice.issue_date,
        invoiceNumber: invoice.invoice_number,
        clientName: invoice.clients?.name || "-",
        clientGstin: invoice.clients?.tax_id || "-",
        hsnCode: hsnSet.size > 0 ? Array.from(hsnSet).join(", ") : "-",
        ratePercent,
        transactionValue,
        cgst,
        sgst,
        igst,
        totalAmount,
        tdsAmount,
      } satisfies GstRow;
    });

    const filteredRows = rows.filter((row) => {
      if (filters.invoice && !row.invoiceNumber.toLowerCase().includes(filters.invoice.toLowerCase())) {
        return false;
      }
      if (filters.client && !row.clientName.toLowerCase().includes(filters.client.toLowerCase())) {
        return false;
      }
      if (filters.gstin && !row.clientGstin.toLowerCase().includes(filters.gstin.toLowerCase())) {
        return false;
      }
      if (filters.hsn && !row.hsnCode.toLowerCase().includes(filters.hsn.toLowerCase())) {
        return false;
      }
      return true;
    });

    if (!sortColumn) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      let aValue: string | number = "";
      let bValue: string | number = "";

      switch (sortColumn) {
        case "date":
          aValue = new Date(a.date).getTime();
          bValue = new Date(b.date).getTime();
          break;
        case "invoiceNumber":
          aValue = a.invoiceNumber;
          bValue = b.invoiceNumber;
          break;
        case "clientName":
          aValue = a.clientName;
          bValue = b.clientName;
          break;
        case "clientGstin":
          aValue = a.clientGstin;
          bValue = b.clientGstin;
          break;
        case "hsnCode":
          aValue = a.hsnCode;
          bValue = b.hsnCode;
          break;
        case "ratePercent":
          aValue = a.ratePercent;
          bValue = b.ratePercent;
          break;
        case "transactionValue":
          aValue = a.transactionValue;
          bValue = b.transactionValue;
          break;
        case "cgst":
          aValue = a.cgst;
          bValue = b.cgst;
          break;
        case "sgst":
          aValue = a.sgst;
          bValue = b.sgst;
          break;
        case "igst":
          aValue = a.igst;
          bValue = b.igst;
          break;
        case "totalAmount":
          aValue = a.totalAmount;
          bValue = b.totalAmount;
          break;
        case "tdsAmount":
          aValue = a.tdsAmount;
          bValue = b.tdsAmount;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredSourceInvoices, filters, sortColumn, sortDirection]);

  const pagination = usePagination({ items: processedRows, itemsPerPage });

  const totals = useMemo(
    () =>
      processedRows.reduce(
        (acc, row) => ({
          transactionValue: acc.transactionValue + row.transactionValue,
          cgst: acc.cgst + row.cgst,
          sgst: acc.sgst + row.sgst,
          igst: acc.igst + row.igst,
          totalAmount: acc.totalAmount + row.totalAmount,
          tdsAmount: acc.tdsAmount + row.tdsAmount,
        }),
        {
          transactionValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          totalAmount: 0,
          tdsAmount: 0,
        },
      ),
    [processedRows],
  );

  const handleExportCSV = () => {
    if (processedRows.length === 0) return;

    const exportRows = processedRows.map((row, index) => ({
      serialNo: index + 1,
      date: formatDate(row.date),
      invoiceNumber: row.invoiceNumber,
      clientName: row.clientName,
      clientGstin: row.clientGstin,
      hsnCode: row.hsnCode,
      rate: `${row.ratePercent.toFixed(2)}%`,
      transactionValue: row.transactionValue.toFixed(2),
      cgst: row.cgst.toFixed(2),
      sgst: row.sgst.toFixed(2),
      igst: row.igst.toFixed(2),
      totalAmount: row.totalAmount.toFixed(2),
      tdsAmount: row.tdsAmount.toFixed(2),
    }));

    const columns: ExportColumn[] = [
      { key: "serialNo", label: "SL.NO" },
      { key: "date", label: "DATE" },
      { key: "invoiceNumber", label: "INVOICE NUMBER" },
      { key: "clientName", label: "CLIENT NAME" },
      { key: "clientGstin", label: "GSTIN - CLIENT" },
      { key: "hsnCode", label: "HSN CODE" },
      { key: "rate", label: "RATE" },
      { key: "transactionValue", label: "TRANSACTION VALUE" },
      { key: "cgst", label: "CGST" },
      { key: "sgst", label: "SGST" },
      { key: "igst", label: "IGST" },
      { key: "totalAmount", label: "Total Amount" },
      { key: "tdsAmount", label: "TDS" },
    ];

    exportToCSV(exportRows, columns, `gst-filing-${getTimestamp()}.csv`);
    toast({
      variant: "success",
      title: "Exported",
      description: `${exportRows.length} row(s) exported to CSV successfully.`,
    });
  };

  const handleExportPDF = async () => {
    if (processedRows.length === 0) return;

    const exportRows = processedRows.map((row, index) => ({
      serialNo: index + 1,
      date: formatDate(row.date),
      invoiceNumber: row.invoiceNumber,
      clientName: row.clientName,
      clientGstin: row.clientGstin,
      hsnCode: row.hsnCode,
      rate: `${row.ratePercent.toFixed(2)}%`,
      transactionValue: row.transactionValue.toFixed(2),
      cgst: row.cgst.toFixed(2),
      sgst: row.sgst.toFixed(2),
      igst: row.igst.toFixed(2),
      totalAmount: row.totalAmount.toFixed(2),
      tdsAmount: row.tdsAmount.toFixed(2),
    }));

    const columns: ExportColumn[] = [
      { key: "serialNo", label: "SL.NO" },
      { key: "date", label: "DATE" },
      { key: "invoiceNumber", label: "INVOICE #" },
      { key: "clientName", label: "CLIENT" },
      { key: "clientGstin", label: "GSTIN" },
      { key: "hsnCode", label: "HSN" },
      { key: "rate", label: "RATE" },
      { key: "transactionValue", label: "TXN VALUE" },
      { key: "cgst", label: "CGST" },
      { key: "sgst", label: "SGST" },
      { key: "igst", label: "IGST" },
      { key: "totalAmount", label: "TOTAL" },
      { key: "tdsAmount", label: "TDS" },
    ];

    await exportToPDF(
      exportRows,
      columns,
      "GST Filing",
      `gst-filing-${getTimestamp()}.pdf`,
    );

    toast({
      variant: "success",
      title: "Exported",
      description: `${exportRows.length} row(s) exported to PDF successfully.`,
    });
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumn(column);
    setSortDirection("asc");
  };

  const clearAllFilters = () => {
    setSelectedClientId(null);
    setFromDate("");
    setToDate("");
    setFilters({
      invoice: "",
      client: "",
      gstin: "",
      hsn: "",
    });
    setSortColumn("date");
    setSortDirection("asc");
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="ml-2 inline h-4 w-4 opacity-40" />;
    }

    return sortDirection === "asc" ? (
      <ArrowUp className="ml-2 inline h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 inline h-4 w-4" />
    );
  };

  const totalTax = totals.cgst + totals.sgst + totals.igst;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight">GST Filing Register</h2>
            <p className="text-sm text-muted-foreground">
              Filter, review, and export accountant-ready GST filing entries.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleExportCSV}
              size="sm"
              variant="outline"
              disabled={processedRows.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button
              onClick={handleExportPDF}
              size="sm"
              variant="outline"
              disabled={processedRows.length === 0}
            >
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12">
          <div className="min-w-0 space-y-1 xl:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Financial Year</span>
            <FinancialYearSelector
              selectedYear={selectedFY}
              onYearChange={setSelectedFY}
              className="w-full"
              triggerClassName="h-10 w-full"
            />
          </div>
          <div className="min-w-0 space-y-1 xl:col-span-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client</span>
            <ClientSelector
              clients={clients}
              selectedClientId={selectedClientId}
              onClientChange={setSelectedClientId}
              className="w-full"
              triggerClassName="h-10 w-full"
            />
          </div>
          <div className="min-w-0 space-y-1 xl:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">From Date</span>
            <Input type="date" className="h-10" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="min-w-0 space-y-1 xl:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">To Date</span>
            <Input type="date" className="h-10" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="min-w-0 xl:col-span-3 flex items-end">
            <Button variant="ghost" className="h-10 w-full xl:w-auto" onClick={clearAllFilters}>
              <FilterX className="mr-2 h-4 w-4" />
              Reset Filters
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Invoices</p>
            <p className="mt-2 text-2xl font-semibold">{processedRows.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Taxable Value</p>
            <p className="mt-2 text-2xl font-semibold">{formatNumber(totals.transactionValue)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Tax</p>
            <p className="mt-2 text-2xl font-semibold">{formatNumber(totalTax)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Gross Amount</p>
            <p className="mt-2 text-2xl font-semibold">{formatNumber(totals.totalAmount)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total TDS</p>
            <p className="mt-2 text-2xl font-semibold text-blue-700">{formatNumber(totals.tdsAmount)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <Table className="min-w-[1580px] text-xs sm:text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px]">SL.NO</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("date")}>DATE<SortIcon column="date" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("invoiceNumber")}>INVOICE NUMBER<SortIcon column="invoiceNumber" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("clientName")}>CLIENT NAME<SortIcon column="clientName" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("clientGstin")}>GSTIN - CLIENT<SortIcon column="clientGstin" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("hsnCode")}>HSN CODE<SortIcon column="hsnCode" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("ratePercent")}>RATE<SortIcon column="ratePercent" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("transactionValue")}>TRANSACTION VALUE<SortIcon column="transactionValue" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("cgst")}>CGST<SortIcon column="cgst" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("sgst")}>SGST<SortIcon column="sgst" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("igst")}>IGST<SortIcon column="igst" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("totalAmount")}>Total Amount<SortIcon column="totalAmount" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("tdsAmount")}>TDS<SortIcon column="tdsAmount" /></TableHead>
            </TableRow>
            <TableRow>
              <TableHead></TableHead>
              <TableHead></TableHead>
              <TableHead>
                <Input
                  placeholder="Filter..."
                  value={filters.invoice}
                  onChange={(e) => setFilters((prev) => ({ ...prev, invoice: e.target.value }))}
                  className="h-7 text-xs"
                />
              </TableHead>
              <TableHead>
                <Input
                  placeholder="Filter..."
                  value={filters.client}
                  onChange={(e) => setFilters((prev) => ({ ...prev, client: e.target.value }))}
                  className="h-7 text-xs"
                />
              </TableHead>
              <TableHead>
                <Input
                  placeholder="Filter..."
                  value={filters.gstin}
                  onChange={(e) => setFilters((prev) => ({ ...prev, gstin: e.target.value }))}
                  className="h-7 text-xs"
                />
              </TableHead>
              <TableHead>
                <Input
                  placeholder="Filter..."
                  value={filters.hsn}
                  onChange={(e) => setFilters((prev) => ({ ...prev, hsn: e.target.value }))}
                  className="h-7 text-xs"
                />
              </TableHead>
              <TableHead></TableHead>
              <TableHead></TableHead>
              <TableHead></TableHead>
              <TableHead></TableHead>
              <TableHead></TableHead>
              <TableHead></TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="text-center text-muted-foreground py-16">
                  No GST filing rows found for the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              pagination.paginatedItems.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell>{(pagination.currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell className="font-medium">{row.invoiceNumber}</TableCell>
                  <TableCell>{row.clientName}</TableCell>
                  <TableCell>{row.clientGstin}</TableCell>
                  <TableCell>{row.hsnCode}</TableCell>
                  <TableCell className="text-right">{row.ratePercent.toFixed(2)}%</TableCell>
                  <TableCell className="text-right">{formatNumber(row.transactionValue)}</TableCell>
                  <TableCell className="text-right">{formatNumber(row.cgst)}</TableCell>
                  <TableCell className="text-right">{formatNumber(row.sgst)}</TableCell>
                  <TableCell className="text-right">{formatNumber(row.igst)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatNumber(row.totalAmount)}</TableCell>
                  <TableCell className="text-right font-semibold text-blue-700">{formatNumber(row.tdsAmount)}</TableCell>
                </TableRow>
              ))
            )}

            {processedRows.length > 0 && (
              <TableRow className="sticky bottom-0 border-t-2 bg-muted font-bold">
                <TableCell colSpan={7}>Total</TableCell>
                <TableCell className="text-right">{formatNumber(totals.transactionValue)}</TableCell>
                <TableCell className="text-right">{formatNumber(totals.cgst)}</TableCell>
                <TableCell className="text-right">{formatNumber(totals.sgst)}</TableCell>
                <TableCell className="text-right">{formatNumber(totals.igst)}</TableCell>
                <TableCell className="text-right">{formatNumber(totals.totalAmount)}</TableCell>
                <TableCell className="text-right text-blue-700">{formatNumber(totals.tdsAmount)}</TableCell>
              </TableRow>
            )}
          </TableBody>
          </Table>
        </div>
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
  );
}
