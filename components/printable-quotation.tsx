"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Printer } from "lucide-react";

interface InvoiceTemplate {
  company_name: string;
  company_tagline?: string | null;
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
  terms_and_conditions?: string | null;
  whatsapp_template_rows?: WhatsAppTemplateRow[] | null;
}

interface WhatsAppTemplateRow {
  category: string;
  price_per_message: string;
  template_type: string;
}

interface PrintableQuotationProps {
  quotation: any;
  template?: InvoiceTemplate | null;
  organizationTaxId?: string | null;
  organizationTagline?: string | null;
}

export function PrintableQuotation({ quotation, template, organizationTaxId, organizationTagline }: PrintableQuotationProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const router = useRouter();
  const printAreaRef = useRef<HTMLDivElement | null>(null);

  const defaultTemplate: InvoiceTemplate = {
    company_name: "Your Company Name",
    company_tagline: "Your trusted communication partner",
    company_address: "123 Business Street, City, State 12345",
    company_phone: "+91 00000 00000",
    company_email: "info@company.com",
    company_logo_url: "/VSN_Groups_LOGO-removebg-preview.png",
    company_logo_file: null,
    company_stamp_url: "/hyd_stamp_%26_Sign.png",
    company_stamp_file: null,
    signatory_label: "Authorized Signatory",
    tax_label: "GST",
    note_content:
      "1. Material once sold will not be taken back.\n2. Kindly verify quantity and amount before confirmation.",
    payment_instructions:
      "1. Please make all payments to the company account only.\n2. Share payment confirmation with transaction reference.\n3. Contact billing support for any clarification.",
    terms_and_conditions:
      "Payment is due within 30 days. Late payments may incur additional charges.",
    whatsapp_template_rows: [
      {
        category: "Marketing",
        price_per_message: "89.5-Paisa",
        template_type:
          "Include promotions or offers, informational updates, or invitation for customers to respond/take action. Any conversation that does not qualify as utility or authentication",
      },
      {
        category: "Utility",
        price_per_message: "25-Paisa",
        template_type:
          "Facilitate a specific, agreed-upon request or transaction or update to a customer about an ongoing transaction, including post-purchase notifications and recurring billing",
      },
      {
        category: "Authentication",
        price_per_message: "16-Paisa",
        template_type:
          "Enable businesses to authenticate users with one-time passcodes, potentially at multiple steps in the login process(e.g., account verification, account recovery, integrity challenges)",
      },
      {
        category: "Service",
        price_per_message: "0-Paisa",
        template_type:
          "All user-initiated conversations will be categorized as service conversations, which help customers resolve enquiries.",
      },
    ],
  };

  const activeTemplate = template || defaultTemplate;
  const logoSrc = activeTemplate.company_logo_file || activeTemplate.company_logo_url;
  const stampSrc =
    activeTemplate.company_stamp_file ||
    activeTemplate.company_stamp_url;
  const signatoryLabel = (activeTemplate.signatory_label || "").trim();
  const shouldShowSignatureBlock = Boolean(stampSrc || signatoryLabel);
  const companyTagline = (activeTemplate.company_tagline || organizationTagline || "").trim();

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
  const roundedGrossTotal = Math.round(Number(quotation.total_amount || 0));

  const issueDateFormatted = new Date(quotation.issue_date).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const noteLines = (activeTemplate.note_content || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const paymentInstructionLines = (activeTemplate.payment_instructions || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const termsLines = (activeTemplate.terms_and_conditions || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const whatsappCategoryRows = Array.isArray(activeTemplate.whatsapp_template_rows) && activeTemplate.whatsapp_template_rows.length > 0
    ? activeTemplate.whatsapp_template_rows
        .filter((row): row is WhatsAppTemplateRow => !!row && typeof row === "object")
        .map((row) => ({
          category: row.category || "",
          price_per_message: row.price_per_message || "",
          template_type: row.template_type || "",
        }))
        .filter((row) => row.category || row.price_per_message || row.template_type)
    : defaultTemplate.whatsapp_template_rows || [];

  const handlePrint = () => {
    setIsPrinting(true);
    applyOnePagePrintScale();
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 100);
  };

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @media print {
        body * { visibility: hidden; }
        .print-area, .print-area * { visibility: visible; }
        .print-area {
          position: absolute;
          left: 0;
          top: 0;
          width: calc(100% / var(--print-scale, 1));
          transform: scale(var(--print-scale, 1));
          transform-origin: top left;
        }
        .no-print { display: none !important; }
        @page { size: A4; margin: 0.45cm; }
        .print-force-2col {
          display: grid !important;
          grid-template-columns: 1.5fr 1fr !important;
          gap: 0.6rem !important;
        }
        .print-force-3col {
          display: grid !important;
          grid-template-columns: 1fr 1fr 1fr !important;
          gap: 0.6rem !important;
        }
        .print-no-break {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        table th,
        table td {
          padding-top: 0.22rem !important;
          padding-bottom: 0.22rem !important;
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

  const isWhatsapp = quotation.quotation_type === "whatsapp";

  return (
    <>
      <div className="no-print mb-3 flex items-center justify-end gap-2">
        <Button onClick={handlePrint} disabled={isPrinting}>
          <Printer className="h-4 w-4 mr-2" />
          Print Quotation
        </Button>
      </div>

      <Card ref={printAreaRef} className="print-area overflow-hidden border-slate-300 shadow-lg print:shadow-none">
        <CardContent className="relative bg-white p-5 text-[13px] leading-snug text-slate-900 md:p-6 print:p-4 print:text-[11px]">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-cyan-700 via-blue-800 to-cyan-700" />

          <div className="mx-auto max-w-[820px]">
            <div className="border-b border-slate-700 pb-4 pt-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 pr-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 print:text-[10px]">
                    Proposal Document
                  </p>
                  <h1 className="mt-1 text-3xl font-extrabold uppercase tracking-[0.14em] text-slate-900 print:text-[28px]">
                    {activeTemplate.company_name}
                  </h1>
                  {companyTagline && (
                    <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-slate-700 print:mt-1.5 print:text-[11px]">
                      {companyTagline}
                    </p>
                  )}
                  {organizationTaxId && (
                    <p className="mt-1 text-xs font-semibold text-slate-700 print:text-[10px]">
                      GST/Tax ID: {organizationTaxId}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-3">
                  {logoSrc && (
                    <img src={logoSrc} alt="Company Logo" className="h-14 w-auto object-contain print:h-12" />
                  )}
                  <div className="min-w-[235px] rounded-sm border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700 print:min-w-[220px] print:px-2.5 print:py-1.5 print:text-[10px]">
                    <div className="flex justify-between gap-4 py-1">
                      <span className="font-semibold">Number</span>
                      <span>{quotation.quotation_number}</span>
                    </div>
                    <div className="flex justify-between gap-4 py-1">
                      <span className="font-semibold">Issue Date</span>
                      <span>{issueDateFormatted}</span>
                    </div>
                    {quotation.reference_number && (
                      <div className="flex justify-between gap-4 py-1">
                        <span className="font-semibold">Reference</span>
                        <span>{quotation.reference_number}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4 mt-4 text-center">
              <h2 className="inline-block rounded-sm border border-slate-600 bg-slate-50 px-6 py-1 text-2xl font-bold tracking-[0.2em] text-slate-900 print:px-5 print:py-0.5 print:text-[22px]">
                QUOTATION
              </h2>
            </div>

            <div className="mb-4 border border-slate-300 rounded-sm bg-slate-50 p-3 print-no-break print:p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 print:text-[10px]">To</p>
              <p className="mt-1 text-lg font-bold leading-tight print:text-[16px]">{quotation.clients?.name}</p>
              {quotation.clients?.address && <p className="mt-1 text-slate-700 print:text-[11px]">{quotation.clients.address}</p>}
              {quotation.clients?.city && (
                <p className="text-slate-700 print:text-[11px]">
                  {quotation.clients.city}
                  {quotation.clients.state ? `, ${quotation.clients.state}` : ""}
                </p>
              )}
            </div>

            <p className="mb-3 text-[13px] text-slate-700 print:mb-2 print:text-[11px]">
              {isWhatsapp
                ? "We are one of the Leading WhatsApp service providers & SMS Services"
                : "We are pleased to share our quotation for the following services."}
            </p>

            <table className="w-full border border-slate-500 text-[13px] print-no-break print:text-[10.5px]">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-500 bg-slate-100 px-2 py-1 text-left font-semibold w-[9%]">Sl.No</th>
                  <th className="border border-slate-500 bg-slate-100 px-2 py-1 text-left font-semibold w-[40%]">Particulars</th>
                  <th className="border border-slate-500 bg-slate-100 px-2 py-1 text-right font-semibold w-[12%]">QTY</th>
                  <th className="border border-slate-500 bg-slate-100 px-2 py-1 text-right font-semibold w-[19%]">Unit Price</th>
                  <th className="border border-slate-500 bg-slate-100 px-2 py-1 text-right font-semibold w-[20%]">Amount In Rupees</th>
                </tr>
              </thead>
              <tbody>
                {quotation.quotation_items?.map((item: any, index: number) => (
                  <tr key={`quotation-item-${index}`}>
                    <td className="border border-slate-400 px-2 py-1 text-center align-top">{index + 1}</td>
                    <td className="border border-slate-400 px-2 py-1 text-center align-top font-medium">
                      <div>{item.products?.name || item.description}</div>
                    </td>
                    <td className="border border-slate-400 px-2 py-1 text-right align-top">
                      {Number(item.quantity).toLocaleString("en-IN", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="border border-slate-400 px-2 py-1 text-right align-top">
                      {Number(item.unit_price).toLocaleString("en-IN", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="border border-slate-400 px-2 py-1 text-right font-semibold align-top">
                      {formatCurrency(item.line_total)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="border border-slate-400 px-2 py-1">&nbsp;</td>
                  <td className="border border-slate-400 px-2 py-1">&nbsp;</td>
                  <td className="border border-slate-400 px-2 py-1">&nbsp;</td>
                  <td className="border border-slate-400 px-2 py-1 text-right font-semibold">Gross Total</td>
                  <td className="border border-slate-400 px-2 py-1 text-right text-[14px] font-bold">
                    {formatCurrency(roundedGrossTotal)}
                  </td>
                </tr>
              </tbody>
            </table>

            {isWhatsapp && (
              <table className="mt-4 w-full border border-slate-500 text-[12px] print-no-break print:mt-3 print:text-[10px]">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-500 px-2 py-1 text-left font-semibold w-[18%]">Category</th>
                    <th className="border border-slate-500 px-2 py-1 text-left font-semibold w-[18%]">Price per Message</th>
                    <th className="border border-slate-500 px-2 py-1 text-left font-semibold">Type of Template</th>
                  </tr>
                </thead>
                <tbody>
                  {whatsappCategoryRows.map((row, index) => (
                    <tr key={`${row.category}-${index}`}>
                      <td className="border border-slate-400 px-2 py-1 text-center align-top">{row.category}</td>
                      <td className="border border-slate-400 px-2 py-1 text-center align-top">{row.price_per_message}</td>
                      <td className="border border-slate-400 px-2 py-1 align-top">{row.template_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="mt-4 space-y-4 print-no-break print:mt-3 print:space-y-3">
              <div className="grid gap-4 md:grid-cols-2 print-force-2col">
                <div className="rounded-sm border border-slate-300 bg-slate-50 p-3 print:p-2.5">
                  <p className="font-bold text-slate-900">Note :</p>
                  {noteLines.length > 0 ? (
                    <ol className="ml-4 list-decimal space-y-0.5 text-[12px] text-slate-700 print:text-[10px]">
                      {noteLines.map((line, idx) => (
                        <li key={`quotation-note-${idx}`}>{line}</li>
                      ))}
                    </ol>
                  ) : (
                    <ol className="ml-4 list-decimal space-y-0.5 text-[12px] text-slate-700 print:text-[10px]">
                      <li>Rates are subject to approval and policy changes.</li>
                      <li>Applicable taxes, if any, will be charged as per current rules.</li>
                    </ol>
                  )}
                </div>

                <div className="rounded-sm border border-slate-300 bg-white p-3 print:p-2.5">
                  <p className="font-bold text-slate-900">Payment Instructions :</p>
                  {paymentInstructionLines.length > 0 ? (
                    <ol className="ml-4 list-decimal space-y-0.5 text-[12px] text-slate-700 print:text-[10px]">
                      {paymentInstructionLines.map((line, idx) => (
                        <li key={`quotation-pay-${idx}`}>{line}</li>
                      ))}
                    </ol>
                  ) : (
                    <ol className="ml-4 list-decimal space-y-0.5 text-[12px] text-slate-700 print:text-[10px]">
                      <li>Please make payment to the company account only.</li>
                      <li>Share payment confirmation with reference details.</li>
                    </ol>
                  )}
                </div>
              </div>

              {quotation.notes && (
                <div className="rounded-sm border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] font-semibold text-slate-700 print:px-2.5 print:py-1.5 print:text-[10px]">
                  <span>Remark:</span> {quotation.notes}
                </div>
              )}

              <div className="pt-2 text-center text-[13px] font-medium text-slate-700 print:pt-1 print:text-[11px]">
                Thank you for your business
              </div>

              {shouldShowSignatureBlock && (
                <div className="flex justify-end print-no-break">
                  <div className="text-center min-w-[170px]">
                    {stampSrc && (
                      <img
                        src={stampSrc}
                        alt="Authorized Stamp and Signature"
                        className="ml-auto h-[86px] w-[165px] object-contain print:h-[74px] print:w-[145px]"
                      />
                    )}
                    {signatoryLabel && (
                      <p className="mt-1 text-xs uppercase tracking-wide text-slate-700 print:text-[10px]">
                        {signatoryLabel}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-cyan-700/50 pt-1.5 text-center text-[10px] leading-relaxed text-slate-600 print:pt-1 print:text-[9px]">
                <p>
                  Address : {activeTemplate.company_address} Mobile : {activeTemplate.company_phone} Email : {activeTemplate.company_email}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="no-print mt-4 flex justify-end">
        <Button onClick={() => router.push("/dashboard/quotations/new")}>
          Create New Quotation
        </Button>
      </div>
    </>
  );
}

