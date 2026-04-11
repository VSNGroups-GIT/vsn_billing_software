"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface InvoiceTemplate {
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_logo_url: string | null;
  company_logo_file: string | null;
  company_stamp_url?: string | null;
  company_stamp_file?: string | null;
  signatory_label?: string | null;
  tax_label: string;
  note_content?: string | null;
  payment_instructions?: string | null;
  terms_and_conditions: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  reference_number?: string;
  issue_date: string;
  due_date: string;
  due_days_type?: string | null;
  status: string;
  subtotal: string;
  tax_amount: string;
  discount_amount: string;
  total_amount: string;
  amount_paid: string;
  notes: string | null;
  total_birds?: number;
  gst_percent?: number | null;
  split_gst?: boolean | null;
  clients: {
    name: string;
    email: string;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
  };
  invoice_items: Array<{
    description: string;
    quantity: string;
    unit_price: string;
    tax_rate: string;
    discount: string;
    line_total: string;
    bird_count: number | null;
    per_bird_adjustment: string | null;
  }>;
}

interface PrintableInvoiceProps {
  invoice: Invoice;
  template?: InvoiceTemplate;
  organizationTaxId?: string | null;
}

export function PrintableInvoice({ invoice, template, organizationTaxId }: PrintableInvoiceProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const router = useRouter();
  const printAreaRef = useRef<HTMLDivElement | null>(null);

  const defaultTemplate: InvoiceTemplate = {
    company_name: "Your Company Name",
    company_address: "123 Business Street, City, State 12345",
    company_phone: "+91 00000 00000",
    company_email: "info@company.com",
    company_logo_url: "/VSN_Groups_LOGO-removebg-preview.png",
    company_logo_file: null,
    company_stamp_url: "/hyd_stamp_%26_Sign.png",
    company_stamp_file: null,
    signatory_label: "Authorized Signatory",
    tax_label: "IGST",
    note_content:
      "1. Material once sold will not be taken back.\n2. Kindly verify quantity and amount before confirmation.",
    payment_instructions:
      "1. Please make all payments to the company account only.\n2. Share payment confirmation with transaction reference.\n3. Contact billing support for any clarification.",
    terms_and_conditions:
      "Payment is due within 30 days. Late payments may incur additional charges.",
  };

  const activeTemplate = template || defaultTemplate;
  const activeTaxLabel =
    activeTemplate.tax_label === "GST" ? "IGST" : activeTemplate.tax_label;
  const roundOff =
    Number(invoice.total_amount) -
    (Number(invoice.subtotal) + Number(invoice.tax_amount) - Number(invoice.discount_amount));
  const shouldShowRoundOff = Math.abs(roundOff) <= 0.5;
  const balance = Number(invoice.total_amount) - Number(invoice.amount_paid);
  const logoSrc =
    activeTemplate.company_logo_file || activeTemplate.company_logo_url;
  const stampSrc =
    activeTemplate.company_stamp_file ||
    activeTemplate.company_stamp_url;
  const signatoryLabel = (activeTemplate.signatory_label || "").trim();
  const shouldShowSignatureBlock = Boolean(stampSrc || signatoryLabel);
  const issueDateFormatted = new Date(invoice.issue_date).toLocaleDateString(
    "en-IN",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  );
  const dueDateFormatted =
    invoice.due_days_type === "end_of_month"
      ? "End of the billed month"
      : new Date(invoice.due_date).toLocaleDateString("en-IN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
  const termsLines = (activeTemplate.terms_and_conditions || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const noteLines = (activeTemplate.note_content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const paymentInstructionLines = (activeTemplate.payment_instructions || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const effectiveTaxPercent =
    Number(invoice.gst_percent) > 0
      ? Number(invoice.gst_percent)
      : Number(invoice.subtotal) > 0
        ? (Number(invoice.tax_amount) / Number(invoice.subtotal)) * 100
        : 0;
  const formatCurrency = (value: string | number) =>
    `₹${Number(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const getDpi = () => {
    const probe = document.createElement("div");
    probe.style.width = "1in";
    probe.style.height = "1in";
    probe.style.position = "absolute";
    probe.style.left = "-100%";
    document.body.appendChild(probe);
    const dpi = probe.offsetWidth || 96;
    document.body.removeChild(probe);
    return dpi;
  };

  const applyOnePagePrintScale = () => {
    const element = printAreaRef.current;
    if (!element) return;

    const dpi = getDpi();
    const pageWidthPx = (210 / 25.4) * dpi;
    const pageHeightPx = (297 / 25.4) * dpi;
    const marginPx = (0.45 / 2.54) * dpi;
    const printableWidth = pageWidthPx - marginPx * 2;
    const printableHeight = pageHeightPx - marginPx * 2;

    const contentWidth = element.scrollWidth;
    const contentHeight = element.scrollHeight;
    const fitScale = Math.min(1, printableWidth / contentWidth, printableHeight / contentHeight) * 0.98;

    document.documentElement.style.setProperty("--print-scale", fitScale.toFixed(3));
  };

  const resetPrintScale = () => {
    document.documentElement.style.setProperty("--print-scale", "1");
  };

  const handlePrint = () => {
    setIsPrinting(true);
    applyOnePagePrintScale();
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 100);
  };

  const handleCreateNewInvoice = () => {
    router.push("/dashboard/invoices/new");
  };

  // Removed PDF generation in favor of print/download flows

  useEffect(() => {
    // Add print-specific styles
    const style = document.createElement("style");
    style.textContent = `
      @media print {
        body * {
          visibility: hidden;
        }
        .print-area, .print-area * {
          visibility: visible;
        }
        .print-area {
          position: absolute;
          left: 0;
          top: 0;
          width: calc(100% / var(--print-scale, 1));
          transform: scale(var(--print-scale, 1));
          transform-origin: top left;
        }
        .no-print {
          display: none !important;
        }
        @page {
          size: A4;
          margin: 0.45cm;
        }
        .print-force-2col {
          display: grid !important;
          grid-template-columns: 1.5fr 1fr !important;
          gap: 0.75rem !important;
        }
        .print-force-3col {
          display: grid !important;
          grid-template-columns: 1fr 1fr 1fr !important;
          gap: 0.75rem !important;
        }
        .print-force-row {
          display: flex !important;
          flex-direction: row !important;
          align-items: flex-start !important;
          justify-content: space-between !important;
          gap: 1rem !important;
        }
        .print-no-break {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
      }
    `;
    document.head.appendChild(style);
    const handleBeforePrint = () => applyOnePagePrintScale();
    const handleAfterPrint = () => resetPrintScale();
    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      document.head.removeChild(style);
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
      resetPrintScale();
    };
  }, []);

  return (
    <>
      <div className="no-print mb-3 flex items-center justify-between gap-2">
        <Button asChild variant="outline">
          <a href="/dashboard/invoices">Back</a>
        </Button>
        <Button onClick={handlePrint} disabled={isPrinting}>
          <Printer className="h-4 w-4 mr-2" />
          Print Invoice
        </Button>
      </div>

      <Card ref={printAreaRef} className="print-area overflow-hidden border-slate-300 shadow-lg print:shadow-none">
        <CardContent className="relative p-5 md:p-6 text-sm print:text-[12px] print:leading-snug bg-white">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-cyan-700 via-blue-800 to-cyan-700" />

          <div className="border-b border-slate-700 pb-4 mb-4 pt-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 pr-4">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500 font-semibold">
                  Billing Document
                </p>
                <h1 className="text-3xl font-extrabold tracking-[0.14em] text-slate-900 uppercase mt-1">
                  {activeTemplate.company_name}
                </h1>
                <p className="text-sm text-slate-700 mt-2 font-medium max-w-xl leading-relaxed">
                  {activeTemplate.company_address}
                </p>
                {organizationTaxId && (
                  <p className="text-xs text-slate-700 mt-1 font-semibold">
                    GST/Tax ID: {organizationTaxId}
                  </p>
                )}
                <p className="text-xs text-slate-600 mt-1.5">
                  {activeTemplate.company_phone} | {activeTemplate.company_email}
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                {logoSrc && (
                  <img
                    src={logoSrc}
                    alt="Company Logo"
                    className="h-16 w-auto object-contain"
                  />
                )}
                <div className="min-w-[230px] rounded-sm border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <div className="flex justify-between gap-4 py-1">
                    <span className="font-semibold">Number</span>
                    <span>{invoice.invoice_number}</span>
                  </div>
                  <div className="flex justify-between gap-4 py-1">
                    <span className="font-semibold">Issue Date</span>
                    <span>{issueDateFormatted}</span>
                  </div>
                  <div className="flex justify-between gap-4 py-1">
                    <span className="font-semibold">Due Date</span>
                    <span>{dueDateFormatted}</span>
                  </div>
                  {invoice.reference_number && (
                    <div className="flex justify-between gap-4 py-1">
                      <span className="font-semibold">Reference</span>
                      <span>{invoice.reference_number}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mb-4">
            <h2 className="inline-block text-2xl font-bold tracking-[0.2em] border border-slate-600 px-6 py-1 rounded-sm bg-slate-50">
              {invoice.status === "draft" ? "QUOTATION" : "INVOICE"}
            </h2>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-[1.5fr_1fr] print-force-2col print-no-break">
            <div className="border border-slate-300 rounded-sm bg-slate-50 p-3">
              <p className="font-semibold uppercase tracking-[0.2em] text-[11px] text-slate-500">Bill To</p>
              <p className="text-xl font-bold leading-tight mt-1">{invoice.clients.name}</p>
              {invoice.clients.address && <p className="mt-1 text-slate-700">{invoice.clients.address}</p>}
              {invoice.clients.city && (
                <p className="text-slate-700">
                  {invoice.clients.city}
                  {invoice.clients.state ? `, ${invoice.clients.state}` : ""}
                  {invoice.clients.zip_code ? ` - ${invoice.clients.zip_code}` : ""}
                </p>
              )}
              {invoice.clients.email && <p className="text-slate-600 mt-1">Email: {invoice.clients.email}</p>}
              {invoice.clients.phone && <p className="text-slate-600">Phone: {invoice.clients.phone}</p>}
            </div>

            <div className="border border-slate-300 rounded-sm bg-white p-3">
              <p className="font-semibold uppercase tracking-[0.2em] text-[11px] text-slate-500">Amount Summary</p>
              <div className="space-y-2 mt-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
                </div>
                {Number(invoice.tax_amount) > 0 && (
                  invoice.split_gst ? (
                    <>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-600">
                          CGST ({(effectiveTaxPercent / 2).toFixed(2)}%)
                        </span>
                        <span className="font-medium">{formatCurrency(Number(invoice.tax_amount) / 2)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-600">
                          SGST ({(effectiveTaxPercent / 2).toFixed(2)}%)
                        </span>
                        <span className="font-medium">{formatCurrency(Number(invoice.tax_amount) / 2)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-600">
                        {activeTaxLabel}
                        {effectiveTaxPercent > 0 ? ` (${effectiveTaxPercent.toFixed(0)}%)` : ""}
                      </span>
                      <span className="font-medium">{formatCurrency(invoice.tax_amount)}</span>
                    </div>
                  )
                )}
                {Number(invoice.discount_amount) > 0 && (
                  <div className="flex justify-between gap-4 text-green-700">
                    <span>Discount</span>
                    <span>-{formatCurrency(invoice.discount_amount)}</span>
                  </div>
                )}
                {shouldShowRoundOff && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-600">Round Off</span>
                    <span className="font-medium">
                      {roundOff >= 0 ? "+" : "-"}
                      {formatCurrency(Math.abs(roundOff))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                  <span>Total</span>
                  <span>{formatCurrency(invoice.total_amount)}</span>
                </div>
                {Number(invoice.amount_paid) > 0 && (
                  <>
                    <div className="flex justify-between gap-4 text-green-700">
                      <span>Amount Paid</span>
                      <span>{formatCurrency(invoice.amount_paid)}</span>
                    </div>
                    <div className="flex justify-between gap-4 font-semibold">
                      <span>Balance Due</span>
                      <span className={balance > 0 ? "text-red-700" : "text-green-700"}>
                        {formatCurrency(balance)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <table className="w-full mb-4 border border-slate-700 text-sm bg-white print-no-break">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-700">
                <th className="border-r border-slate-500 py-1.5 px-2 text-left w-14">Sl.No</th>
                <th className="border-r border-slate-500 py-1.5 px-2 text-left">Particulars</th>
                <th className="border-r border-slate-500 py-1.5 px-2 text-right w-24">QTY</th>
                <th className="border-r border-slate-500 py-1.5 px-2 text-right w-32">Unit Price</th>
                <th className="py-1.5 px-2 text-right w-40">Amount In Rupees</th>
              </tr>
            </thead>
            <tbody>
              {invoice.invoice_items.map((item, index) => (
                <tr key={`item-${index}`} className="border-b border-slate-300 even:bg-slate-50/40">
                  <td className="border-r border-slate-300 px-2 py-1.5 text-center">{index + 1}</td>
                  <td className="border-r border-slate-300 px-2 py-1.5 font-medium">
                    {item.description}
                  </td>
                  <td className="border-r border-slate-300 px-2 py-1.5 text-right">
                    {Number(item.quantity).toLocaleString("en-IN", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="border-r border-slate-300 px-2 py-1.5 text-right">
                    ₹{Number(item.unit_price).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold">
                    ₹{Number(item.line_total).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="grid gap-3 md:grid-cols-3 print-force-3col print-no-break">
            <div className="bg-slate-50 border border-slate-300 rounded-sm p-3">
              <h4 className="font-bold text-lg">Note :</h4>
              {noteLines.length > 0 ? (
                <ol className="list-decimal ml-5 space-y-1">
                  {noteLines.map((line, idx) => (
                    <li key={`note-${idx}`} className="leading-snug">
                      {line}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-slate-600">No notes configured.</p>
              )}
            </div>

            <div className="bg-white border border-slate-300 rounded-sm p-3">
              <h4 className="font-bold text-lg">Payment Instructions :</h4>
              {paymentInstructionLines.length > 0 ? (
                <ol className="list-decimal ml-5 space-y-1">
                  {paymentInstructionLines.map((line, idx) => (
                    <li key={`payment-instruction-${idx}`}>{line}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-slate-600">No payment instructions configured.</p>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-300 rounded-sm p-3">
              <h4 className="font-bold text-lg">Terms & Conditions :</h4>
              {termsLines.length > 0 ? (
                <ol className="list-decimal ml-5 space-y-1">
                  {termsLines.map((line, idx) => (
                    <li key={`term-${idx}`}>{line}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-slate-600">No terms configured.</p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-700 print-no-break">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="text-lg mb-1 font-semibold">Thank you for your business</p>
                <p className="text-sm text-slate-600 max-w-md">
                  This document is system generated and intended for billing confirmation and record keeping.
                </p>
              </div>

              {shouldShowSignatureBlock && (
                <div className="text-center min-w-[170px] -mr-1 print:mr-0">
                  {stampSrc && (
                    <img
                      src={stampSrc}
                      alt="Authorized Stamp and Signature"
                      className="h-[86px] w-[165px] object-contain ml-auto"
                    />
                  )}
                  {signatoryLabel && (
                    <p className="text-xs uppercase tracking-wide mt-1 text-slate-700">
                      {signatoryLabel}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="no-print mt-4 flex justify-end">
        <Button onClick={handleCreateNewInvoice}>Create New Invoice</Button>
      </div>
    </>
  );
}
