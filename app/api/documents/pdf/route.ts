import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { chromium } from "playwright-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedDocumentPdfParams, type SharedDocumentType } from "@/lib/document-pdf-link";

export const maxDuration = 60;

type Row = Record<string, unknown>;

function formatCurrency(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return `Rs. ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" ? (value as Row) : {};
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(asRow) : [];
}

function getPrimaryClient(value: unknown): Row {
  if (Array.isArray(value)) {
    return asRow(value[0]);
  }
  return asRow(value);
}

function splitLines(value: unknown) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderOrderedList(lines: string[], emptyFallback: string) {
  if (!lines.length) {
    return `<p style="margin: 6px 0 0; color: #64748b; font-size: 12px;">${escapeHtml(emptyFallback)}</p>`;
  }

  return `<ol style="margin: 6px 0 0; padding-left: 18px; color: #334155; font-size: 12px; line-height: 1.45;">${lines
    .map((line) => `<li style="margin: 2px 0;">${escapeHtml(line)}</li>`)
    .join("")}</ol>`;
}

function numberToWords(value: number) {
  const ones = [
    "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  const belowThousand = (num: number): string => {
    const parts: string[] = [];
    if (num >= 100) {
      parts.push(`${ones[Math.floor(num / 100)]} hundred`);
      num %= 100;
    }
    if (num >= 20) {
      parts.push(tens[Math.floor(num / 10)]);
      if (num % 10) parts.push(ones[num % 10]);
    } else if (num > 0) {
      parts.push(ones[num]);
    }
    return parts.join(" ").trim();
  };

  if (!Number.isFinite(value) || value <= 0) return "Zero rupees only";
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);
  const segments = [
    { divisor: 10000000, label: "crore" },
    { divisor: 100000, label: "lakh" },
    { divisor: 1000, label: "thousand" },
  ];

  let remainder = rupees;
  const words: string[] = [];
  segments.forEach(({ divisor, label }) => {
    if (remainder >= divisor) {
      const segValue = Math.floor(remainder / divisor);
      words.push(`${belowThousand(segValue)} ${label}`);
      remainder %= divisor;
    }
  });
  if (remainder > 0) words.push(belowThousand(remainder));
  const rupeesWords = words.join(" ").trim() || "zero";
  const cap = rupeesWords.charAt(0).toUpperCase() + rupeesWords.slice(1);
  if (paise > 0) return `${cap} rupees and ${belowThousand(paise)} paise only`;
  return `${cap} rupees only`;
}

async function loadDocument(documentType: SharedDocumentType, documentId: string) {
  const supabase = createAdminClient();
  const table = documentType === "invoice" ? "invoices" : "quotations";
  const numberField = documentType === "invoice" ? "invoice_number" : "quotation_number";
  const select = documentType === "invoice"
    ? `
      *,
      clients(name, email, phone, address, city, state, zip_code),
      invoice_items(description, quantity, unit_price, line_total),
      organizations:organization_id(name, address, phone, email, tax_id, tagline)
    `
    : `
      *,
      clients(name, email, phone, address, city, state, zip_code),
      quotation_items(description, quantity, unit_price, line_total, products(name)),
      organizations:organization_id(name, address, phone, email, tax_id, tagline)
    `;

  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq("id", documentId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Document not found");
  }

  const row = asRow(data);
  const templateType = documentType === "invoice"
    ? "invoice"
    : row.quotation_type === "whatsapp"
      ? "quotation_whatsapp"
      : "quotation_other";

  const { data: template } = await supabase
    .from("invoice_templates")
    .select("company_name, company_tagline, company_address, note_content, payment_instructions, terms_and_conditions, signatory_label")
    .eq("organization_id", String(row.organization_id || ""))
    .eq("template_type", templateType)
    .maybeSingle();

  return { row, numberField, template: asRow(template) };
}

function buildPdf(documentType: SharedDocumentType, payload: Awaited<ReturnType<typeof loadDocument>>) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  let y = margin;

  const row = payload.row;
  const org = asRow(row.organizations);
  const template = payload.template;
  const client = getPrimaryClient(row.clients);
  const items = asRows(documentType === "invoice" ? row.invoice_items : row.quotation_items);
  const number = String(row[payload.numberField] || "");
  const title = documentType === "invoice" ? "INVOICE" : "QUOTATION";
  const companyName = String(template.company_name || org.name || "VSN Groups");
  const companySubline = documentType === "invoice"
    ? String(template.company_address || org.address || "")
    : String(template.company_tagline || org.tagline || "");
  const notesLines = splitLines(template.note_content || row.notes);
  const paymentLines = splitLines(template.payment_instructions);
  const termsLines = splitLines(template.terms_and_conditions);
  const signatoryLabel = String(template.signatory_label || "").trim();
  const referenceNumber = String(row.reference_number || "").trim();
  const subtotal = Number(row.subtotal || 0);
  const total = Number(row.total_amount || 0);
  const tax = documentType === "invoice"
    ? Number(row.tax_amount || 0)
    : (subtotal * Number(row.gst_percent || 0)) / 100;
  const discount = Number(row.discount_amount || 0);
  const amountPaid = Number(row.amount_paid || 0);
  const balance = total - amountPaid;
  const companyPhone = String(org.phone || "");
  const companyEmail = String(org.email || "");
  const taxId = String(org.tax_id || "");

  const ensure = (needed: number) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  // ===== HEADER SECTION =====
  doc.setFillColor(6, 107, 173);
  doc.rect(0, 0, pageWidth, 3, "F");

  // Left: Company info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(companyName, margin, y + 2.5);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  if (companySubline) {
    doc.text(companySubline, margin, y);
    y += 3;
  }
  if (taxId) {
    doc.text(`GST/Tax ID: ${taxId}`, margin, y);
    y += 2.5;
  }
  if (companyPhone || companyEmail) {
    doc.text([companyPhone, companyEmail].filter(Boolean).join(" | "), margin, y);
    y += 2.5;
  }

  // Right: Metadata box
  const metaBoxX = margin + 110;
  const metaBoxY = margin;
  const metaBoxW = pageWidth - metaBoxX - margin;
  const metaBoxH = y - margin + 1;

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.5);
  doc.rect(metaBoxX, metaBoxY, metaBoxW, metaBoxH);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  let metaY = metaBoxY + 2;

  doc.setFont("helvetica", "bold");
  doc.text("Number", metaBoxX + 2, metaY);
  doc.setFont("helvetica", "normal");
  doc.text(number || "-", metaBoxX + metaBoxW - 2, metaY, { align: "right" });
  metaY += 3;

  doc.setFont("helvetica", "bold");
  doc.text("Issue Date", metaBoxX + 2, metaY);
  doc.setFont("helvetica", "normal");
  doc.text(formatDate(String(row.issue_date || "")), metaBoxX + metaBoxW - 2, metaY, { align: "right" });
  metaY += 3;

  doc.setFont("helvetica", "bold");
  doc.text("Due Date", metaBoxX + 2, metaY);
  doc.setFont("helvetica", "normal");
  const dueText = row.due_days_type === "end_of_month" ? "End of month" : formatDate(String(row.due_date || ""));
  doc.text(dueText, metaBoxX + metaBoxW - 2, metaY, { align: "right" });
  metaY += 3;

  if (referenceNumber) {
    doc.setFont("helvetica", "bold");
    doc.text("Reference", metaBoxX + 2, metaY);
    doc.setFont("helvetica", "normal");
    doc.text(referenceNumber, metaBoxX + metaBoxW - 2, metaY, { align: "right" });
  }

  y = Math.max(y, metaBoxY + metaBoxH) + 3;

  // Title
  const titleBoxW = 35;
  const titleBoxX = margin + (pageWidth - margin * 2 - titleBoxW) / 2;
  doc.setDrawColor(100, 116, 139);
  doc.rect(titleBoxX, y, titleBoxW, 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(title, titleBoxX + titleBoxW / 2, y + 4, { align: "center" });
  y += 8;

  // ===== TWO-COLUMN SECTION =====
  const col1X = margin;
  const col1W = 85;
  const col2X = col1X + col1W + 3;
  const col2W = pageWidth - col2X - margin;

  // Bill To
  doc.setDrawColor(100, 116, 139);
  doc.rect(col1X, y, col1W, 35);
  doc.setFillColor(220, 230, 240);
  doc.rect(col1X, y, col1W, 5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("BILL TO", col1X + 2, y + 3.5);

  let billY = y + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(String(client.name || "Client"), col1X + 2, billY);
  billY += 3.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const billLines = [
    String(client.address || ""),
    [client.city, client.state, client.zip_code].filter(Boolean).join(", "),
  ].filter(Boolean);

  billLines.forEach((line) => {
    if (billY < y + 33) {
      const wrapped = doc.splitTextToSize(line, col1W - 4);
      wrapped.forEach((part: string) => {
        if (billY < y + 33) {
          doc.text(part, col1X + 2, billY);
          billY += 2.5;
        }
      });
    }
  });

  // Amount Summary
  doc.setDrawColor(100, 116, 139);
  doc.rect(col2X, y, col2W, 35);
  doc.setFillColor(240, 245, 250);
  doc.rect(col2X, y, col2W, 5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("AMOUNT SUMMARY", col2X + 2, y + 3.5);

  let summaryY = y + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);

  doc.text("Subtotal", col2X + 2, summaryY);
  doc.text(formatCurrency(subtotal), col2X + col2W - 2, summaryY, { align: "right" });
  summaryY += 3;

  if (tax > 0) {
    doc.text("Tax", col2X + 2, summaryY);
    doc.text(formatCurrency(tax), col2X + col2W - 2, summaryY, { align: "right" });
    summaryY += 3;
  }

  if (discount > 0) {
    doc.setTextColor(34, 197, 94);
    doc.text("Discount", col2X + 2, summaryY);
    doc.text(`-${formatCurrency(discount)}`, col2X + col2W - 2, summaryY, { align: "right" });
    doc.setTextColor(0, 0, 0);
    summaryY += 3;
  }

  doc.setDrawColor(150, 150, 150);
  doc.line(col2X + 1, summaryY - 1, col2X + col2W - 1, summaryY - 1);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Total", col2X + 2, summaryY + 1);
  doc.text(formatCurrency(total), col2X + col2W - 2, summaryY + 1, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  const amountWords = numberToWords(total);
  doc.text(`Amount in words: ${amountWords}`, col2X + 2, summaryY + 5);

  if (amountPaid > 0) {
    doc.setTextColor(34, 197, 94);
    doc.text("Amount Paid", col2X + 2, summaryY + 8.5);
    doc.text(formatCurrency(amountPaid), col2X + col2W - 2, summaryY + 8.5, { align: "right" });

    doc.setTextColor(185, 28, 28);
    doc.text("Balance Due", col2X + 2, summaryY + 11.5);
    doc.text(formatCurrency(Math.max(0, balance)), col2X + col2W - 2, summaryY + 11.5, { align: "right" });
  }

  doc.setTextColor(0, 0, 0);
  y += 37;

  // ===== ITEMS TABLE =====
  ensure(35);

  const tableX = margin;
  const tableW = pageWidth - margin * 2;
  const slColW = 8;
  const partColW = 65;
  const qtyColW = 18;
  const priceColW = 22;
  const amountColW = tableW - slColW - partColW - qtyColW - priceColW - 1;

  const colX = [
    tableX,
    tableX + slColW,
    tableX + slColW + partColW,
    tableX + slColW + partColW + qtyColW,
    tableX + slColW + partColW + qtyColW + priceColW,
  ];

  // Header
  doc.setFillColor(70, 100, 130);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.rect(tableX, y, tableW, 5, "F");

  doc.text("Sl.No", colX[0] + 2, y + 3.5);
  doc.text("Particulars", colX[1] + 2, y + 3.5);
  doc.text("QTY", colX[2] + qtyColW - 3, y + 3.5, { align: "right" });
  doc.text("Unit Price", colX[3] + priceColW - 3, y + 3.5, { align: "right" });
  doc.text("Amount In Rupees", colX[4] + amountColW - 3, y + 3.5, { align: "right" });

  y += 5;

  // Rows
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  items.forEach((item, idx) => {
    const description = String(item.description || asRow(item.products).name || "-");
    const descLines = doc.splitTextToSize(description, partColW - 3);
    const rowH = Math.max(4.5, descLines.length * 3 + 1);

    ensure(rowH + 1);

    // Alternating background
    if (idx % 2 === 1) {
      doc.setFillColor(245, 248, 250);
      doc.rect(tableX, y, tableW, rowH, "F");
    }

    // Borders
    doc.setDrawColor(120, 130, 140);
    doc.setLineWidth(0.3);
    doc.rect(tableX, y, tableW, rowH);

    // Column dividers
    doc.line(colX[1], y, colX[1], y + rowH);
    doc.line(colX[2], y, colX[2], y + rowH);
    doc.line(colX[3], y, colX[3], y + rowH);
    doc.line(colX[4], y, colX[4], y + rowH);

    // Data
    doc.setTextColor(0, 0, 0);
    doc.text(String(idx + 1), colX[0] + 2, y + 2.5);

    descLines.forEach((line: string, lineIdx: number) => {
      doc.text(line, colX[1] + 2, y + 2.5 + lineIdx * 3);
    });

    const qty = Number(item.quantity || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    doc.text(qty, colX[2] + qtyColW - 3, y + 2.5, { align: "right" });

    const unitPrice = `₹${Number(item.unit_price || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    doc.text(unitPrice, colX[3] + priceColW - 3, y + 2.5, { align: "right" });

    const lineTotal = `₹${Number(item.line_total || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    doc.setFont("helvetica", "bold");
    doc.text(lineTotal, colX[4] + amountColW - 3, y + 2.5, { align: "right" });
    doc.setFont("helvetica", "normal");

    y += rowH;
  });

  // ===== THREE-COLUMN SECTION =====
  y += 2;
  ensure(40);

  const box3W = (pageWidth - margin * 2 - 4) / 3;
  const boxes = [
    { x: margin, title: "Note :", lines: notesLines },
    { x: margin + box3W + 2, title: "Payment Instructions :", lines: paymentLines },
    { x: margin + box3W * 2 + 4, title: "Terms & Conditions :", lines: termsLines },
  ];

  boxes.forEach((box, boxIdx) => {
    doc.setDrawColor(100, 116, 139);
    doc.rect(box.x, y, box3W, 35);

    doc.setFillColor(boxIdx === 1 ? 255 : 240, boxIdx === 1 ? 255 : 245, boxIdx === 1 ? 255 : 250);
    doc.rect(box.x, y, box3W, 5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(box.title, box.x + 2, y + 3.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);

    let boxY = y + 6;
    box.lines.forEach((line: string, idx: number) => {
      if (boxY < y + 34) {
        const wrapped = doc.splitTextToSize(`${idx + 1}. ${line}`, box3W - 3);
        wrapped.forEach((part: string) => {
          if (boxY < y + 34) {
            doc.text(part, box.x + 1.5, boxY);
            boxY += 2;
          }
        });
      }
    });
  });

  y += 37;

  // ===== FOOTER =====
  y += 2;
  ensure(8);

  doc.setDrawColor(100, 116, 139);
  doc.line(margin, y, pageWidth - margin, y);
  y += 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Thank you for your business", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  y += 3;
  doc.text("This document is system generated and intended for billing confirmation and record keeping.", margin, y);

  // Signatory
  if (signatoryLabel) {
    y += 5;
    ensure(7);
    doc.setDrawColor(100, 116, 139);
    doc.line(pageWidth - margin - 35, y, pageWidth - margin, y);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(signatoryLabel, pageWidth - margin, y, { align: "right" });
  }

  return doc.output("arraybuffer");
}

function buildDocumentHtml(documentType: SharedDocumentType, payload: Awaited<ReturnType<typeof loadDocument>>) {
  const isInvoice = documentType === "invoice";
  const row = payload.row;
  const org = asRow(row.organizations);
  const template = payload.template;
  const client = getPrimaryClient(row.clients);
  const items = asRows(documentType === "invoice" ? row.invoice_items : row.quotation_items);

  const documentNumber = String(row[payload.numberField] || "");
  const issueDate = formatDate(String(row.issue_date || ""));
  const dueDate = row.due_days_type === "end_of_month" ? "End of the billed month" : formatDate(String(row.due_date || ""));
  const referenceNumber = String(row.reference_number || "").trim();

  const subtotal = Number(row.subtotal || 0);
  const taxAmount = isInvoice ? Number(row.tax_amount || 0) : (subtotal * Number(row.gst_percent || 0)) / 100;
  const discountAmount = Number(row.discount_amount || 0);
  const totalAmount = Number(row.total_amount || 0);
  const amountPaid = Number(row.amount_paid || 0);
  const balanceDue = totalAmount - amountPaid;
  const splitGst = Boolean(row.split_gst);
  const effectiveTaxPercent = Number(row.gst_percent) > 0
    ? Number(row.gst_percent)
    : subtotal > 0
      ? (taxAmount / subtotal) * 100
      : 0;

  const companyName = String(template.company_name || org.name || "VSN Groups");
  const companyAddress = isInvoice
    ? String(template.company_address || org.address || "")
    : String(template.company_tagline || org.tagline || "");
  const companyPhone = String(org.phone || "");
  const companyEmail = String(org.email || "");
  const companyTaxId = String(org.tax_id || "");
  const signatoryLabel = String(template.signatory_label || "").trim();
  const amountInWords = numberToWords(totalAmount);

  const noteLines = splitLines(template.note_content || row.notes);
  const paymentLines = splitLines(template.payment_instructions);
  const termsLines = splitLines(template.terms_and_conditions);
  const roundOff = totalAmount - (subtotal + taxAmount - discountAmount);
  const shouldShowRoundOff = Math.abs(roundOff) <= 0.5;
  const activeTaxLabel = "IGST";

  const itemRows = items
    .map((item, index) => {
      const label = String(item.description || asRow(item.products).name || "-");
      return `
        <tr>
          <td style="border: 1px solid #94a3b8; padding: 6px; text-align: center;">${index + 1}</td>
          <td style="border: 1px solid #94a3b8; padding: 6px;">${escapeHtml(label)}</td>
          <td style="border: 1px solid #94a3b8; padding: 6px; text-align: right;">${Number(item.quantity || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
          <td style="border: 1px solid #94a3b8; padding: 6px; text-align: right;">${formatCurrency(item.unit_price as string | number)}</td>
          <td style="border: 1px solid #94a3b8; padding: 6px; text-align: right; font-weight: 600;">${formatCurrency(item.line_total as string | number)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; width: 100%; max-width: 860px; margin: 0 auto; border: 1px solid #cbd5e1; overflow: hidden; background: #fff; color: #0f172a;">
      <div style="height: 6px; background: linear-gradient(90deg, #0e7490, #1e3a8a, #0e7490);"></div>
      <div style="padding: 16px;">
        <div style="border-bottom: 1px solid #334155; padding-bottom: 14px; margin-bottom: 14px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="vertical-align: top; padding-right: 10px;">
                <p style="margin: 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #64748b; font-weight: 700;">${isInvoice ? "Billing Document" : "Proposal Document"}</p>
                <h1 style="margin: 6px 0 0; font-size: 30px; letter-spacing: 0.14em; text-transform: uppercase; color: #0f172a;">${escapeHtml(companyName)}</h1>
                ${companyAddress ? `<p style="margin: 8px 0 0; font-size: 13px; color: #334155;">${escapeHtml(companyAddress)}</p>` : ""}
                ${companyTaxId ? `<p style="margin: 6px 0 0; font-size: 12px; color: #334155; font-weight: 600;">GST/Tax ID: ${escapeHtml(companyTaxId)}</p>` : ""}
                ${isInvoice ? `<p style="margin: 6px 0 0; font-size: 12px; color: #64748b;">${escapeHtml(companyPhone)} | ${escapeHtml(companyEmail)}</p>` : ""}
              </td>
              <td style="vertical-align: top; text-align: right; width: 260px;">
                <table style="margin-top: 8px; width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 12px; color: #334155;">
                  <tr><td style="padding: 6px; font-weight: 600;">Number</td><td style="padding: 6px; text-align: right;">${escapeHtml(documentNumber || "-")}</td></tr>
                  <tr><td style="padding: 6px; font-weight: 600;">Issue Date</td><td style="padding: 6px; text-align: right;">${issueDate}</td></tr>
                  ${isInvoice ? `<tr><td style="padding: 6px; font-weight: 600;">Due Date</td><td style="padding: 6px; text-align: right;">${escapeHtml(dueDate || "-")}</td></tr>` : ""}
                  ${referenceNumber ? `<tr><td style="padding: 6px; font-weight: 600;">Reference</td><td style="padding: 6px; text-align: right;">${escapeHtml(referenceNumber)}</td></tr>` : ""}
                </table>
              </td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin-bottom: 14px;">
          <span style="display: inline-block; border: 1px solid #334155; background: #f8fafc; padding: 4px 20px; font-size: 24px; font-weight: 700; letter-spacing: 0.18em;">${isInvoice ? "INVOICE" : "QUOTATION"}</span>
        </div>

        ${isInvoice ? `
          <table style="width: 100%; border-collapse: separate; border-spacing: 10px; margin: 0 -10px 12px;">
            <tr>
              <td style="width: 60%; vertical-align: top; border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px;">
                <p style="margin: 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #64748b; font-weight: 700;">Bill To</p>
                <p style="margin: 6px 0 0; font-size: 20px; font-weight: 700; color: #0f172a;">${escapeHtml(String(client.name || "Client"))}</p>
                ${(client.address || "") ? `<p style="margin: 4px 0 0; font-size: 13px; color: #334155;">${escapeHtml(String(client.address || ""))}</p>` : ""}
                ${(client.city || "") ? `<p style="margin: 2px 0 0; font-size: 13px; color: #334155;">${escapeHtml(String(client.city || ""))}${client.state ? `, ${escapeHtml(String(client.state))}` : ""}${client.zip_code ? ` - ${escapeHtml(String(client.zip_code))}` : ""}</p>` : ""}
                ${client.email ? `<p style="margin: 2px 0 0; font-size: 12px; color: #64748b;">Email: ${escapeHtml(String(client.email))}</p>` : ""}
                ${client.phone ? `<p style="margin: 2px 0 0; font-size: 12px; color: #64748b;">Phone: ${escapeHtml(String(client.phone))}</p>` : ""}
              </td>
              <td style="width: 40%; vertical-align: top; border: 1px solid #cbd5e1; background: #fff; padding: 10px;">
                <p style="margin: 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #64748b; font-weight: 700;">Amount Summary</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px;">
                  <tr><td style="padding: 4px 0; color: #475569;">Subtotal</td><td style="padding: 4px 0; text-align: right;">${formatCurrency(subtotal)}</td></tr>
                  ${taxAmount > 0 ? (splitGst
                    ? `<tr><td style="padding: 4px 0; color: #475569;">CGST (${(effectiveTaxPercent / 2).toFixed(2)}%)</td><td style="padding: 4px 0; text-align: right;">${formatCurrency(taxAmount / 2)}</td></tr>
                       <tr><td style="padding: 4px 0; color: #475569;">SGST (${(effectiveTaxPercent / 2).toFixed(2)}%)</td><td style="padding: 4px 0; text-align: right;">${formatCurrency(taxAmount / 2)}</td></tr>`
                    : `<tr><td style="padding: 4px 0; color: #475569;">${escapeHtml(activeTaxLabel)}${effectiveTaxPercent > 0 ? ` (${effectiveTaxPercent.toFixed(0)}%)` : ""}</td><td style="padding: 4px 0; text-align: right;">${formatCurrency(taxAmount)}</td></tr>`)
                    : ""}
                  ${discountAmount > 0 ? `<tr><td style="padding: 4px 0; color: #166534;">Discount</td><td style="padding: 4px 0; text-align: right; color: #166534;">-${formatCurrency(discountAmount)}</td></tr>` : ""}
                  ${shouldShowRoundOff ? `<tr><td style="padding: 4px 0; color: #475569;">Round Off</td><td style="padding: 4px 0; text-align: right;">${roundOff >= 0 ? "+" : "-"}${formatCurrency(Math.abs(roundOff))}</td></tr>` : ""}
                  <tr><td style="padding: 6px 0; border-top: 1px solid #cbd5e1; font-size: 16px; font-weight: 700;">Total</td><td style="padding: 6px 0; border-top: 1px solid #cbd5e1; text-align: right; font-size: 16px; font-weight: 700;">${formatCurrency(totalAmount)}</td></tr>
                  <tr><td colspan="2" style="padding-top: 6px; font-size: 12px; font-style: italic; color: #64748b;">Amount in words: ${escapeHtml(amountInWords)}</td></tr>
                  ${amountPaid > 0 ? `<tr><td style="padding: 4px 0; color: #166534;">Amount Paid</td><td style="padding: 4px 0; text-align: right; color: #166534;">${formatCurrency(amountPaid)}</td></tr><tr><td style="padding: 4px 0; font-weight: 600;">Balance Due</td><td style="padding: 4px 0; text-align: right; font-weight: 600; color: ${balanceDue > 0 ? "#b91c1c" : "#166534"};">${formatCurrency(balanceDue)}</td></tr>` : ""}
                </table>
              </td>
            </tr>
          </table>
        ` : `
          <div style="border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px; margin-bottom: 12px;">
            <p style="margin: 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #64748b; font-weight: 700;">To</p>
            <p style="margin: 6px 0 0; font-size: 18px; font-weight: 700; color: #0f172a;">${escapeHtml(String(client.name || "Client"))}</p>
            ${(client.address || "") ? `<p style="margin: 4px 0 0; font-size: 13px; color: #334155;">${escapeHtml(String(client.address || ""))}</p>` : ""}
            ${(client.city || "") ? `<p style="margin: 2px 0 0; font-size: 13px; color: #334155;">${escapeHtml(String(client.city || ""))}${client.state ? `, ${escapeHtml(String(client.state))}` : ""}${client.zip_code ? ` - ${escapeHtml(String(client.zip_code))}` : ""}</p>` : ""}
            ${client.email ? `<p style="margin: 2px 0 0; font-size: 12px; color: #64748b;">Email: ${escapeHtml(String(client.email))}</p>` : ""}
            ${client.phone ? `<p style="margin: 2px 0 0; font-size: 12px; color: #64748b;">Phone: ${escapeHtml(String(client.phone))}</p>` : ""}
          </div>
        `}

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 13px;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="border: 1px solid #94a3b8; padding: 6px; text-align: left; width: 56px;">Sl.No</th>
              <th style="border: 1px solid #94a3b8; padding: 6px; text-align: left;">Particulars</th>
              <th style="border: 1px solid #94a3b8; padding: 6px; text-align: right; width: 90px;">QTY</th>
              <th style="border: 1px solid #94a3b8; padding: 6px; text-align: right; width: 130px;">Unit Price</th>
              <th style="border: 1px solid #94a3b8; padding: 6px; text-align: right; width: 150px;">Amount In Rupees</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows || `<tr><td colspan="5" style="border: 1px solid #94a3b8; padding: 10px; text-align: center; color: #64748b;">No line items</td></tr>`}
          </tbody>
        </table>

        <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin: 0 -8px;">
          <tr>
            <td style="width: ${isInvoice ? "33%" : "50%"}; vertical-align: top; border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px;">
              <p style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">Note :</p>
              ${renderOrderedList(noteLines, "No notes configured.")}
            </td>
            <td style="width: ${isInvoice ? "33%" : "50%"}; vertical-align: top; border: 1px solid #cbd5e1; background: #fff; padding: 10px;">
              <p style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">Payment Instructions :</p>
              ${renderOrderedList(paymentLines, "No payment instructions configured.")}
            </td>
            ${isInvoice ? `<td style="width: 33%; vertical-align: top; border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px;"><p style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">Terms & Conditions :</p>${renderOrderedList(termsLines, "No terms configured.")}</td>` : ""}
          </tr>
        </table>

        <div style="margin-top: 10px; border-top: 1px solid #334155; padding-top: 10px; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px;">
          <div>
            <p style="margin: 0; font-size: 18px; font-weight: 600;">Thank you for your business</p>
            <p style="margin: 4px 0 0; color: #64748b; font-size: 12px;">This document is system generated and intended for billing confirmation and record keeping.</p>
          </div>
          ${signatoryLabel ? `<div style="text-align: center; min-width: 160px;"><p style="margin: 4px 0 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155;">${escapeHtml(signatoryLabel)}</p></div>` : ""}
        </div>
      </div>
    </div>
  `;
}

async function renderPdfFromHtml(html: string) {
  let executablePath: string | undefined;
  let launchArgs: string[] = [];
  if (process.env.VERCEL) {
    const chromiumPkg = (await import("@sparticuz/chromium")).default;
    const chromiumUrl =
      process.env.CHROMIUM_PACK_URL ||
      "https://github.com/Sparticuz/chromium/releases/download/v147.0.0/chromium-v147.0.0-pack.x64.tar";
    executablePath = await chromiumPkg.executablePath(chromiumUrl);
    launchArgs = chromiumPkg.args;
  }

  const browser = await chromium.launch({
    args: launchArgs,
    executablePath,
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

export async function GET(req: NextRequest) {
  try {
    const validation = verifySignedDocumentPdfParams(req.nextUrl.searchParams);
    if (!validation.isValid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 401 });
    }

    const payload = await loadDocument(validation.documentType, validation.documentId);
    const html = buildDocumentHtml(validation.documentType, payload);
    const pdf = await renderPdfFromHtml(html);
    const number = String(payload.row[payload.numberField] || validation.documentId).replace(/[^a-zA-Z0-9-_]+/g, "-");

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${validation.documentType}-${number}.pdf"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate PDF";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}