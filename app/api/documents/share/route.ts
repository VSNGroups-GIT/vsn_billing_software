import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send-email";
import { buildSignedDocumentPdfUrl } from "@/lib/document-pdf-link";

export const maxDuration = 60;

type DocumentType = "invoice" | "quotation";
type ShareChannel = "email" | "whatsapp";

interface ShareRequestBody {
  documentType: DocumentType;
  documentId: string;
  channel: ShareChannel;
}

interface ShareDocumentClient {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

interface ShareDocumentRecord {
  id: string;
  organization_id: string;
  invoice_number?: string | null;
  quotation_number?: string | null;
  quotation_type?: string | null;
  clients?: ShareDocumentClient | ShareDocumentClient[] | null;
}

const SUBJECT_BY_TYPE: Record<DocumentType, string> = {
  invoice: "Invoice from VSN Groups",
  quotation: "Quotation from VSN Groups",
};

const DASHBOARD_PATH_BY_TYPE: Record<DocumentType, string> = {
  invoice: "invoices",
  quotation: "quotations",
};

const NUMBER_FIELD_BY_TYPE: Record<DocumentType, string> = {
  invoice: "invoice_number",
  quotation: "quotation_number",
};

function formatCurrency(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return `Rs. ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function splitLines(value: string | null | undefined) {
  return (value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  const convertBelowThousand = (num: number): string => {
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

  if (!Number.isFinite(value) || value <= 0) {
    return "Zero rupees only";
  }

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
      const segmentValue = Math.floor(remainder / divisor);
      words.push(`${convertBelowThousand(segmentValue)} ${label}`);
      remainder %= divisor;
    }
  });

  if (remainder > 0) words.push(convertBelowThousand(remainder));

  const rupeesWords = words.join(" ").trim() || "zero";
  const cap = rupeesWords.charAt(0).toUpperCase() + rupeesWords.slice(1);

  if (paise > 0) {
    return `${cap} rupees and ${convertBelowThousand(paise)} paise only`;
  }

  return `${cap} rupees only`;
}

function getBaseUrl(req: NextRequest) {
  const normalize = (value: string) => value.replace(/\/$/, "");
  const isPublicHost = (value: string) => !/localhost|127\.0\.0\.1/i.test(value);

  const envCandidates = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ].filter(Boolean) as string[];

  for (const candidate of envCandidates) {
    const normalized = normalize(candidate);
    if (isPublicHost(normalized)) {
      return normalized;
    }
  }

  const forwardedHost = req.headers.get("x-forwarded-host") || "";
  const host = req.headers.get("host") || "";
  const headerHost = forwardedHost || host;
  const proto = req.headers.get("x-forwarded-proto") || "http";

  if (headerHost && isPublicHost(headerHost)) {
    const resolvedProto = proto === "http" && /vercel\.app|onrender\.com|railway\.app|netlify\.app/i.test(headerHost)
      ? "https"
      : proto;
    return `${resolvedProto}://${headerHost}`;
  }

  // Last-resort fallback for local development.
  return "http://localhost:3000";
}

function resolvePublicAssetUrl(baseUrl: string, raw?: string | null) {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^data:/i.test(trimmed)) return trimmed;

  if (trimmed.startsWith("/")) {
    return `${baseUrl}${trimmed}`;
  }

  return `${baseUrl}/${trimmed}`;
}

function normalizePhone(phone: string) {
  return phone.replace(/[^0-9+]/g, "").trim();
}

function normalizePhoneForWhatsApp(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function buildWhatsappPdfLink(
  documentType: DocumentType,
  documentId: string,
  baseUrl: string,
  documentUrl: string,
  pdfUrl: string,
) {
  const configuredTemplate = (process.env.WHATSAPP_PDF_LINK_TEMPLATE || "").trim();

  if (configuredTemplate) {
    return configuredTemplate
      .replaceAll("{documentType}", documentType)
      .replaceAll("{documentId}", documentId)
      .replaceAll("{baseUrl}", baseUrl)
      .replaceAll("{documentUrl}", documentUrl)
      .replaceAll("{pdfUrl}", pdfUrl)
      .replaceAll("{dashboardPath}", DASHBOARD_PATH_BY_TYPE[documentType]);
  }

  return pdfUrl;
}

async function createHostedPdfLinkForWhatsapp(
  req: NextRequest,
  documentType: DocumentType,
  documentId: string,
  documentNumber: string,
  organizationId: string,
) {
  const internalBaseUrl = req.nextUrl.origin;
  const sourcePdfUrl = buildSignedDocumentPdfUrl(internalBaseUrl, documentType, documentId);

  const sourcePdfResponse = await fetch(sourcePdfUrl, { method: "GET" });
  if (!sourcePdfResponse.ok) {
    let detail = `status ${sourcePdfResponse.status}`;
    try {
      const body = await sourcePdfResponse.json();
      if (body?.error) detail = body.error;
    } catch { /* response wasn't JSON */ }
    throw new Error(`Failed to generate PDF: ${detail}`);
  }

  const pdfBytes = await sourcePdfResponse.arrayBuffer();
  const admin = createAdminClient();
  const bucket = (process.env.WHATSAPP_PDF_BUCKET || "shared-documents").trim() || "shared-documents";

  const { error: getBucketError } = await admin.storage.getBucket(bucket);
  if (getBucketError) {
    const { error: createBucketError } = await admin.storage.createBucket(bucket, { public: false });
    if (createBucketError && !/exists|already/i.test(createBucketError.message || "")) {
      throw new Error(`Failed to prepare PDF bucket: ${createBucketError.message}`);
    }
  }

  const safeDocumentNumber = (documentNumber || documentId).replace(/[^a-zA-Z0-9._-]+/g, "-");
  const filePath = `${organizationId}/${documentType}/${safeDocumentNumber}-${Date.now()}.pdf`;

  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(filePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload PDF: ${uploadError.message}`);
  }

  const { data: signedUrlData, error: signedUrlError } = await admin.storage
    .from(bucket)
    .createSignedUrl(filePath, 7 * 24 * 60 * 60);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    throw new Error(`Failed to create PDF link: ${signedUrlError?.message || "unknown error"}`);
  }

  return signedUrlData.signedUrl;
}

function providerResponseHasFailure(payload: any) {
  if (!payload || typeof payload !== "object") return false;

  if (payload.success === false) return true;
  if (payload.error) return true;

  const status = String(payload.status || payload.message_status || "").toLowerCase();
  if (["failed", "error", "rejected", "undelivered"].includes(status)) {
    return true;
  }

  return false;
}

function extractProviderMessageId(payload: any) {
  if (!payload || typeof payload !== "object") return "";
  return (
    payload.message_id ||
    payload.messageId ||
    payload.id ||
    payload.messages?.[0]?.id ||
    payload.data?.id ||
    ""
  );
}

function getFromEmailByType(documentType: DocumentType) {
  const invoiceFrom =
    process.env.INVOICE_FROM_EMAIL ||
    process.env.invoice_from_email ||
    "billing@vsngroups.com";
  const quotationFrom =
    process.env.QUOTATION_FROM_EMAIL ||
    process.env.quotation_from_email ||
    "sales@vsngroups.com";

  return documentType === "invoice" ? invoiceFrom : quotationFrom;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ShareRequestBody;
    const { documentType, documentId, channel } = body;

    if (!documentType || !documentId || !channel) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    if (documentType !== "invoice" && documentType !== "quotation") {
      return NextResponse.json({ success: false, error: "Invalid document type" }, { status: 400 });
    }

    if (channel !== "email" && channel !== "whatsapp") {
      return NextResponse.json({ success: false, error: "Invalid channel" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ success: false, error: "Organization not found" }, { status: 403 });
    }

    const tableName = documentType === "invoice" ? "invoices" : "quotations";
    const numberField = NUMBER_FIELD_BY_TYPE[documentType];
    const documentSelect = documentType === "quotation"
      ? `id, organization_id, ${numberField}, quotation_type, clients(name, email, phone)`
      : `id, organization_id, ${numberField}, clients(name, email, phone)`;

    const { data: document, error: documentError } = await supabase
      .from(tableName)
      .select(documentSelect)
      .eq("id", documentId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();

    if (documentError || !document) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }

    const normalizedDocument = document as unknown as ShareDocumentRecord;
    const client = Array.isArray(normalizedDocument.clients) ? normalizedDocument.clients[0] : normalizedDocument.clients;
    const clientName = client?.name || "Client";
    const clientEmail = client?.email || "";
    const clientPhone = client?.phone || "";
    const documentNumber = (normalizedDocument[numberField as keyof ShareDocumentRecord] as string | null) || "";

    const baseUrl = getBaseUrl(req);
    const path = DASHBOARD_PATH_BY_TYPE[documentType];
    const documentUrl = `${baseUrl}/dashboard/${path}/${documentId}`;

    if (channel === "email") {
      if (!clientEmail) {
        return NextResponse.json({ success: false, error: "Client email is missing" }, { status: 400 });
      }

      const { data: organization } = await supabase
        .from("organizations")
        .select("name, address, phone, email, tax_id, tagline")
        .eq("id", profile.organization_id)
        .maybeSingle();

      const isInvoice = documentType === "invoice";
      const templateType = isInvoice
        ? "invoice"
        : (normalizedDocument.quotation_type === "whatsapp" ? "quotation_whatsapp" : "quotation_other");

      const { data: template } = await supabase
        .from("invoice_templates")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .eq("template_type", templateType)
        .maybeSingle();

      // Prefer URL-based assets in emails (many clients block data URI images).
      const logoSrc = resolvePublicAssetUrl(baseUrl, template?.company_logo_url || "/VSN_Groups_LOGO-removebg-preview.png");
      const stampSrc = resolvePublicAssetUrl(baseUrl, template?.company_stamp_url || "");
      const signatoryLabel = (template?.signatory_label || "").trim();
      const companyName = template?.company_name || organization?.name || "VSN Groups";
      const companyAddress = templateType === "invoice"
        ? (template?.company_address || organization?.address || "")
        : (template?.company_tagline || organization?.tagline || "");
      const companyPhone = template?.company_phone || organization?.phone || "";
      const companyEmail = template?.company_email || organization?.email || "";
      const companyTaxId = organization?.tax_id || "";

      let issueDate = "";
      let dueDate = "";
      let referenceNumber = "";
      let subtotal = 0;
      let taxAmount = 0;
      let discountAmount = 0;
      let totalAmount = 0;
      let amountPaid = 0;
      let splitGst = false;
      let effectiveTaxPercent = 0;
      let itemRows = "";
      let extraWhatsappCategoryTable = "";
      let introText = "";

      if (isInvoice) {
        const { data: detailedInvoice, error: detailError } = await supabase
          .from("invoices")
          .select(
            `issue_date, due_date, due_days_type, reference_number, subtotal, tax_amount, discount_amount, total_amount, amount_paid, gst_percent, split_gst, notes, invoice_items(description, quantity, unit_price, line_total)`,
          )
          .eq("id", documentId)
          .eq("organization_id", profile.organization_id)
          .maybeSingle();

        if (detailError || !detailedInvoice) {
          return NextResponse.json({ success: false, error: "Failed to load invoice details" }, { status: 500 });
        }

        issueDate = detailedInvoice.issue_date || "";
        dueDate = detailedInvoice.due_days_type === "end_of_month" ? "End of the billed month" : formatDate(detailedInvoice.due_date);
        referenceNumber = detailedInvoice.reference_number || "";
        subtotal = Number(detailedInvoice.subtotal || 0);
        taxAmount = Number(detailedInvoice.tax_amount || 0);
        discountAmount = Number(detailedInvoice.discount_amount || 0);
        totalAmount = Number(detailedInvoice.total_amount || 0);
        amountPaid = Number(detailedInvoice.amount_paid || 0);
        splitGst = Boolean(detailedInvoice.split_gst);
        effectiveTaxPercent = Number(detailedInvoice.gst_percent) > 0
          ? Number(detailedInvoice.gst_percent)
          : subtotal > 0
            ? (taxAmount / subtotal) * 100
            : 0;

        const items = Array.isArray(detailedInvoice.invoice_items) ? detailedInvoice.invoice_items : [];
        itemRows = items
          .map((item: any, index: number) => `
            <tr>
              <td style="border: 1px solid #94a3b8; padding: 6px; text-align: center;">${index + 1}</td>
              <td style="border: 1px solid #94a3b8; padding: 6px;">${escapeHtml(String(item.description || "-"))}</td>
              <td style="border: 1px solid #94a3b8; padding: 6px; text-align: right;">${Number(item.quantity || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
              <td style="border: 1px solid #94a3b8; padding: 6px; text-align: right;">${formatCurrency(item.unit_price)}</td>
              <td style="border: 1px solid #94a3b8; padding: 6px; text-align: right; font-weight: 600;">${formatCurrency(item.line_total)}</td>
            </tr>
          `)
          .join("");
      } else {
        const { data: detailedQuotation, error: detailError } = await supabase
          .from("quotations")
          .select(
            `issue_date, due_date, quotation_type, reference_number, subtotal, gst_percent, total_amount, notes, quotation_items(description, quantity, unit_price, line_total, products(name))`,
          )
          .eq("id", documentId)
          .eq("organization_id", profile.organization_id)
          .maybeSingle();

        if (detailError || !detailedQuotation) {
          return NextResponse.json({ success: false, error: "Failed to load quotation details" }, { status: 500 });
        }

        issueDate = detailedQuotation.issue_date || "";
        dueDate = formatDate(detailedQuotation.due_date);
        referenceNumber = detailedQuotation.reference_number || "";
        subtotal = Number(detailedQuotation.subtotal || 0);
        taxAmount = (subtotal * Number(detailedQuotation.gst_percent || 0)) / 100;
        discountAmount = 0;
        totalAmount = Number(detailedQuotation.total_amount || 0);
        introText = detailedQuotation.quotation_type === "whatsapp"
          ? "We are one of the Leading WhatsApp service providers & SMS Services"
          : "We are pleased to share our quotation for the following services.";

        const items = Array.isArray(detailedQuotation.quotation_items) ? detailedQuotation.quotation_items : [];
        itemRows = items
          .map((item: any, index: number) => {
            const label = item.products?.name || item.description || "-";
            return `
              <tr>
                <td style="border: 1px solid #94a3b8; padding: 6px; text-align: center;">${index + 1}</td>
                <td style="border: 1px solid #94a3b8; padding: 6px;">${escapeHtml(String(label))}</td>
                <td style="border: 1px solid #94a3b8; padding: 6px; text-align: right;">${Number(item.quantity || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                <td style="border: 1px solid #94a3b8; padding: 6px; text-align: right;">${Number(item.unit_price || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                <td style="border: 1px solid #94a3b8; padding: 6px; text-align: right; font-weight: 600;">${formatCurrency(item.line_total)}</td>
              </tr>
            `;
          })
          .join("");

        if (detailedQuotation.quotation_type === "whatsapp" && Array.isArray(template?.whatsapp_template_rows) && template.whatsapp_template_rows.length > 0) {
          const rows = template.whatsapp_template_rows
            .map((row: any) => `
              <tr>
                <td style="border: 1px solid #94a3b8; padding: 6px;">${escapeHtml(String(row?.category || ""))}</td>
                <td style="border: 1px solid #94a3b8; padding: 6px;">${escapeHtml(String(row?.price_per_message || ""))}</td>
                <td style="border: 1px solid #94a3b8; padding: 6px;">${escapeHtml(String(row?.template_type || ""))}</td>
              </tr>
            `)
            .join("");

          extraWhatsappCategoryTable = `
            <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px;">
              <thead>
                <tr style="background: #f1f5f9;">
                  <th style="border: 1px solid #94a3b8; padding: 6px; text-align: left;">Category</th>
                  <th style="border: 1px solid #94a3b8; padding: 6px; text-align: left;">Price per Message</th>
                  <th style="border: 1px solid #94a3b8; padding: 6px; text-align: left;">Type of Template</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          `;
        }
      }

      const subject = `${SUBJECT_BY_TYPE[documentType]}${documentNumber ? ` - ${documentNumber}` : ""}`;
      const noteLines = splitLines(template?.note_content);
      const paymentLines = splitLines(template?.payment_instructions);
      const termsLines = splitLines(template?.terms_and_conditions);
      const balanceDue = totalAmount - amountPaid;
      const amountInWords = numberToWords(totalAmount);
      const roundOff = totalAmount - (subtotal + taxAmount - discountAmount);
      const shouldShowRoundOff = Math.abs(roundOff) <= 0.5;
      const activeTaxLabel = template?.tax_label === "GST" ? "IGST" : (template?.tax_label || "IGST");

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 860px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #fff; color: #0f172a;">
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
                    ${logoSrc ? `<img src="${logoSrc}" alt="Company Logo" style="max-height: 54px; max-width: 190px; object-fit: contain; margin-left: auto;"/>` : ""}
                    <table style="margin-top: 8px; width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 12px; color: #334155;">
                      <tr><td style="padding: 6px; font-weight: 600;">Number</td><td style="padding: 6px; text-align: right;">${escapeHtml(documentNumber || "-")}</td></tr>
                      <tr><td style="padding: 6px; font-weight: 600;">Issue Date</td><td style="padding: 6px; text-align: right;">${formatDate(issueDate)}</td></tr>
                      ${isInvoice ? `<tr><td style="padding: 6px; font-weight: 600;">Due Date</td><td style="padding: 6px; text-align: right;">${escapeHtml(dueDate || "-")}</td></tr>` : ""}
                      ${referenceNumber ? `<tr><td style="padding: 6px; font-weight: 600;">Reference</td><td style="padding: 6px; text-align: right;">${escapeHtml(referenceNumber)}</td></tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>
            </div>

            <div style="text-align: center; margin-bottom: 14px;">
              <span style="display: inline-block; border: 1px solid #334155; background: #f8fafc; padding: 4px 20px; border-radius: 4px; font-size: 24px; font-weight: 700; letter-spacing: 0.18em;">${isInvoice ? "INVOICE" : "QUOTATION"}</span>
            </div>

            ${isInvoice ? `
              <table style="width: 100%; border-collapse: separate; border-spacing: 10px; margin: 0 -10px 12px;">
                <tr>
                  <td style="width: 60%; vertical-align: top; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; padding: 10px;">
                    <p style="margin: 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #64748b; font-weight: 700;">Bill To</p>
                    <p style="margin: 6px 0 0; font-size: 20px; font-weight: 700; color: #0f172a;">${escapeHtml(clientName)}</p>
                    ${(client?.address || "") ? `<p style="margin: 4px 0 0; font-size: 13px; color: #334155;">${escapeHtml(String(client?.address || ""))}</p>` : ""}
                    ${(client?.city || "") ? `<p style="margin: 2px 0 0; font-size: 13px; color: #334155;">${escapeHtml(String(client?.city || ""))}${client?.state ? `, ${escapeHtml(String(client.state))}` : ""}${client?.zip_code ? ` - ${escapeHtml(String(client.zip_code))}` : ""}</p>` : ""}
                    ${client?.email ? `<p style="margin: 2px 0 0; font-size: 12px; color: #64748b;">Email: ${escapeHtml(String(client.email))}</p>` : ""}
                    ${client?.phone ? `<p style="margin: 2px 0 0; font-size: 12px; color: #64748b;">Phone: ${escapeHtml(String(client.phone))}</p>` : ""}
                  </td>
                  <td style="width: 40%; vertical-align: top; border: 1px solid #cbd5e1; background: #fff; border-radius: 4px; padding: 10px;">
                    <p style="margin: 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #64748b; font-weight: 700;">Amount Summary</p>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px;">
                      <tr><td style="padding: 4px 0; color: #475569;">Subtotal</td><td style="padding: 4px 0; text-align: right;">${formatCurrency(subtotal)}</td></tr>
                      ${taxAmount > 0 ? (
                        splitGst
                          ? `<tr><td style="padding: 4px 0; color: #475569;">CGST (${(effectiveTaxPercent / 2).toFixed(2)}%)</td><td style="padding: 4px 0; text-align: right;">${formatCurrency(taxAmount / 2)}</td></tr>
                             <tr><td style="padding: 4px 0; color: #475569;">SGST (${(effectiveTaxPercent / 2).toFixed(2)}%)</td><td style="padding: 4px 0; text-align: right;">${formatCurrency(taxAmount / 2)}</td></tr>`
                          : `<tr><td style="padding: 4px 0; color: #475569;">${escapeHtml(activeTaxLabel)}${effectiveTaxPercent > 0 ? ` (${effectiveTaxPercent.toFixed(0)}%)` : ""}</td><td style="padding: 4px 0; text-align: right;">${formatCurrency(taxAmount)}</td></tr>`
                      ) : ""}
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
              <div style="border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px; margin-bottom: 12px; border-radius: 4px;">
                <p style="margin: 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #64748b; font-weight: 700;">To</p>
                <p style="margin: 6px 0 0; font-size: 18px; font-weight: 700; color: #0f172a;">${escapeHtml(clientName)}</p>
                ${(client?.address || "") ? `<p style="margin: 4px 0 0; font-size: 13px; color: #334155;">${escapeHtml(String(client?.address || ""))}</p>` : ""}
                ${(client?.city || "") ? `<p style="margin: 2px 0 0; font-size: 13px; color: #334155;">${escapeHtml(String(client?.city || ""))}${client?.state ? `, ${escapeHtml(String(client.state))}` : ""}${client?.zip_code ? ` - ${escapeHtml(String(client.zip_code))}` : ""}</p>` : ""}
              </div>
            `}

            ${!isInvoice && introText ? `<p style="margin: 0 0 10px; color: #475569;">${escapeHtml(introText)}</p>` : ""}

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

            ${extraWhatsappCategoryTable}

            ${!isInvoice ? `<table style="margin-left: auto; min-width: 320px; border-collapse: collapse; font-size: 13px; margin-bottom: 12px;">
              <tr><td style="padding: 4px 0; color: #475569;">Subtotal</td><td style="padding: 4px 0; text-align: right;">${formatCurrency(subtotal)}</td></tr>
              <tr><td style="padding: 4px 0; color: #475569;">Tax</td><td style="padding: 4px 0; text-align: right;">${formatCurrency(taxAmount)}</td></tr>
              <tr><td style="padding: 4px 0; color: #475569;">Discount</td><td style="padding: 4px 0; text-align: right;">-${formatCurrency(discountAmount)}</td></tr>
              <tr><td style="padding: 6px 0; border-top: 1px solid #cbd5e1; font-size: 16px; font-weight: 700;">Total</td><td style="padding: 6px 0; border-top: 1px solid #cbd5e1; text-align: right; font-size: 16px; font-weight: 700;">${formatCurrency(totalAmount)}</td></tr>
            </table>
            ` : ""}

            <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin: 0 -8px;">
              <tr>
                <td style="width: ${isInvoice ? "33%" : "50%"}; vertical-align: top; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; padding: 10px;">
                  <p style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">Note :</p>
                  ${renderOrderedList(noteLines, "No notes configured.")}
                </td>
                <td style="width: ${isInvoice ? "33%" : "50%"}; vertical-align: top; border: 1px solid #cbd5e1; background: #fff; border-radius: 4px; padding: 10px;">
                  <p style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">Payment Instructions :</p>
                  ${renderOrderedList(paymentLines, "No payment instructions configured.")}
                </td>
                ${isInvoice ? `<td style="width: 33%; vertical-align: top; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; padding: 10px;"><p style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">Terms & Conditions :</p>${renderOrderedList(termsLines, "No terms configured.")}</td>` : ""}
              </tr>
            </table>

            <div style="margin-top: 10px; border-top: 1px solid #334155; padding-top: 10px; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px;">
              <div>
                <p style="margin: 0; font-size: 18px; font-weight: 600;">Thank you for your business</p>
                <p style="margin: 4px 0 0; color: #64748b; font-size: 12px;">This document is system generated and intended for billing confirmation and record keeping.</p>
              </div>
              ${(stampSrc || signatoryLabel) ? `<div style="text-align: center; min-width: 160px;">${stampSrc ? `<img src="${stampSrc}" alt="Signatory" style="max-height: 86px; max-width: 165px; object-fit: contain; margin-left: auto;"/>` : ""}${signatoryLabel ? `<p style="margin: 4px 0 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155;">${escapeHtml(signatoryLabel)}</p>` : ""}</div>` : ""}
            </div>

            ${!isInvoice ? `<div style="margin-top: 8px; border-top: 1px solid #0e7490; padding-top: 6px; text-align: center; font-size: 11px; color: #64748b;">Address : ${escapeHtml(template?.company_address || organization?.address || "")} Mobile : ${escapeHtml(companyPhone)} Email : ${escapeHtml(companyEmail)}</div>` : ""}
          </div>
        </div>
      `;

      const result = await sendEmail({
        to: clientEmail,
        subject,
        html,
        from: getFromEmailByType(documentType),
      });

      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error || "Failed to send email" }, { status: 500 });
      }

      return NextResponse.json({ success: true, channel, message: "Email sent successfully" });
    }

    if (!clientPhone) {
      return NextResponse.json({ success: false, error: "Client phone is missing" }, { status: 400 });
    }

    const whatsappApiUrl = process.env.WHATSAPP_API_URL;
    const whatsappApiKey = process.env.WHATSAPP_API_KEY;
    const whatsappTemplateName = process.env.WHATSAPP_TEMPLATE_NAME || "info_3478465789987678";
    const whatsappTemplateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";

    if (!whatsappApiUrl || !whatsappApiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "WhatsApp API is not configured yet. Set WHATSAPP_API_URL and WHATSAPP_API_KEY.",
        },
        { status: 400 },
      );
    }

    const normalizedClientPhone = normalizePhoneForWhatsApp(clientPhone);
    if (!normalizedClientPhone) {
      return NextResponse.json({ success: false, error: "Client phone is invalid for WhatsApp" }, { status: 400 });
    }

    let waIssueDate = "-";
    let waTotalAmount = formatCurrency(0);
    let waSummaryText = "";

    if (documentType === "invoice") {
      const { data: detailedInvoice } = await supabase
        .from("invoices")
        .select("issue_date, total_amount")
        .eq("id", documentId)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();

      waIssueDate = formatDate(detailedInvoice?.issue_date);
      waTotalAmount = formatCurrency(detailedInvoice?.total_amount || 0);
      waSummaryText = `Please find your invoice${documentNumber ? ` (${documentNumber})` : ""}.`;
    } else {
      const { data: detailedQuotation } = await supabase
        .from("quotations")
        .select("issue_date, total_amount")
        .eq("id", documentId)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();

      waIssueDate = formatDate(detailedQuotation?.issue_date);
      waTotalAmount = formatCurrency(detailedQuotation?.total_amount || 0);
      waSummaryText = `Please find your quotation${documentNumber ? ` (${documentNumber})` : ""}.`;
    }

    const generatedPdfLink = await createHostedPdfLinkForWhatsapp(
      req,
      documentType,
      documentId,
      documentNumber,
      profile.organization_id,
    );

    const pdfLink = buildWhatsappPdfLink(documentType, documentId, baseUrl, documentUrl, generatedPdfLink);
    const pdfFileName = `${documentType}-${documentNumber || documentId}.pdf`.replace(/[^a-zA-Z0-9._-]+/g, "-");

    const whatsappPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedClientPhone,
      type: "template",
      template: {
        name: whatsappTemplateName,
        language: {
          code: whatsappTemplateLanguage,
        },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: "document",
                document: {
                  link: pdfLink,
                  filename: pdfFileName,
                },
              },
            ],
          },
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: clientName || "Customer",
              },
              {
                type: "text",
                text: waSummaryText,
              },
              {
                type: "text",
                text: `${documentType === "invoice" ? "Invoice" : "Quotation"} No: ${documentNumber || "-"}`,
              },
              {
                type: "text",
                text: `Issue Date: ${waIssueDate}`,
              },
              {
                type: "text",
                text: `Total: ${waTotalAmount}`,
              },
              {
                type: "text",
                text: pdfLink,
              },
            ],
          },
        ],
      },
    };

    // Validate the generated PDF link before sending it to WhatsApp provider.
    let pdfLinkReachable = false;
    let pdfLinkStatus = 0;
    try {
      const pdfCheck = await fetch(pdfLink, { method: "GET" });
      pdfLinkReachable = pdfCheck.ok;
      pdfLinkStatus = pdfCheck.status;
    } catch {
      pdfLinkReachable = false;
      pdfLinkStatus = 0;
    }

    if (!pdfLinkReachable) {
      return NextResponse.json(
        {
          success: false,
          error: "Generated PDF link is not publicly reachable",
          details: {
            pdfLink,
            pdfLinkStatus,
          },
        },
        { status: 500 },
      );
    }

    const whatsappResponse = await fetch(whatsappApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: whatsappApiKey,
      },
      body: JSON.stringify(whatsappPayload),
    });

    const whatsappResponseText = await whatsappResponse.text();

    let whatsappResponseJson: any = null;
    try {
      whatsappResponseJson = whatsappResponseText ? JSON.parse(whatsappResponseText) : null;
    } catch {
      whatsappResponseJson = null;
    }

    if (!whatsappResponse.ok) {
      const providerError =
        whatsappResponseJson?.message ||
        whatsappResponseJson?.error?.message ||
        whatsappResponseText ||
        whatsappResponse.statusText;

      return NextResponse.json(
        {
          success: false,
          error: `WhatsApp API call failed (${whatsappResponse.status}): ${providerError}`,
          details: {
            providerStatus: whatsappResponse.status,
            pdfLink,
          },
        },
        { status: 500 },
      );
    }

    if (providerResponseHasFailure(whatsappResponseJson)) {
      return NextResponse.json(
        {
          success: false,
          error:
            whatsappResponseJson.message ||
            whatsappResponseJson.error?.message ||
            "WhatsApp provider rejected the message",
          details: {
            providerResponse: whatsappResponseJson,
            pdfLink,
          },
        },
        { status: 500 },
      );
    }

    const providerMessageId = extractProviderMessageId(whatsappResponseJson);

    return NextResponse.json({
      success: true,
      channel,
      message: providerMessageId
        ? `WhatsApp message accepted by provider (ID: ${providerMessageId})`
        : "WhatsApp request accepted by provider",
      details: {
        to: normalizedClientPhone,
        documentType,
        documentNumber,
        pdfLink,
        providerMessageId,
        providerResponse: whatsappResponseJson || whatsappResponseText || null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
