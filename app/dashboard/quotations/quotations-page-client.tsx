"use client";

import { useState } from "react";
import { ClientSelector } from "@/components/client-selector";
import { QuotationsTable } from "@/components/quotations-table";
import {
  FinancialYearSelector,
  getFinancialYear,
  getFinancialYearDateRange,
} from "@/components/financial-year-selector";

interface Client {
  id: string;
  name: string;
}

interface Quotation {
  id: string;
  client_id: string;
  quotation_number: string;
  quotation_type: "whatsapp" | "other";
  issue_date: string;
  due_date: string;
  status: string;
  total_amount: string;
  converted_invoice_id: string | null;
  clients: { name: string; email: string };
}

interface QuotationsPageClientProps {
  clients: Client[];
  quotations: Quotation[];
  userRole?: string;
}

export function QuotationsPageClient({ clients, quotations, userRole }: QuotationsPageClientProps) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedFY, setSelectedFY] = useState<string>(getFinancialYear());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = quotations.filter((q) => {
    if (selectedClientId && q.client_id !== selectedClientId) return false;

    const { start, end } = getFinancialYearDateRange(selectedFY);
    const issueDate = q.issue_date;
    if (issueDate < start || issueDate > end) return false;

    if (fromDate && issueDate < fromDate) return false;
    if (toDate && issueDate > toDate) return false;

    return true;
  });

  return (
    <div className="space-y-6">
      <QuotationsTable
        quotations={filtered}
        userRole={userRole}
        toolbarLeft={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">FY:</span>
            <FinancialYearSelector
              selectedYear={selectedFY}
              onYearChange={setSelectedFY}
            />
            <span className="text-sm font-medium text-muted-foreground">Client:</span>
            <ClientSelector
              clients={clients}
              selectedClientId={selectedClientId}
              onClientChange={setSelectedClientId}
            />
            <span className="text-sm font-medium text-muted-foreground">From:</span>
            <input
              type="date"
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <span className="text-sm font-medium text-muted-foreground">To:</span>
            <input
              type="date"
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        }
      />
    </div>
  );
}
