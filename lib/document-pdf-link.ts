import { createHmac, timingSafeEqual } from "crypto";

export type SharedDocumentType = "invoice" | "quotation";

const PDF_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getDocumentShareSecret() {
  return (
    process.env.DOCUMENT_SHARE_TOKEN_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "development-document-share-secret"
  );
}

function createSignature(documentType: SharedDocumentType, documentId: string, expires: string) {
  return createHmac("sha256", getDocumentShareSecret())
    .update(`${documentType}:${documentId}:${expires}`)
    .digest("hex");
}

export function buildSignedDocumentPdfUrl(baseUrl: string, documentType: SharedDocumentType, documentId: string) {
  const expires = String(Date.now() + PDF_LINK_TTL_MS);
  const signature = createSignature(documentType, documentId, expires);
  const url = new URL("/api/documents/pdf", baseUrl);
  url.searchParams.set("documentType", documentType);
  url.searchParams.set("documentId", documentId);
  url.searchParams.set("expires", expires);
  url.searchParams.set("signature", signature);
  return url.toString();
}

export function verifySignedDocumentPdfParams(searchParams: URLSearchParams) {
  const documentType = searchParams.get("documentType");
  const documentId = searchParams.get("documentId");
  const expires = searchParams.get("expires");
  const signature = searchParams.get("signature");

  if (!documentType || !documentId || !expires || !signature) {
    return { isValid: false as const, error: "Missing PDF link parameters" };
  }

  if (documentType !== "invoice" && documentType !== "quotation") {
    return { isValid: false as const, error: "Invalid document type" };
  }

  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { isValid: false as const, error: "PDF link has expired" };
  }

  const expectedSignature = createSignature(documentType, documentId, expires);
  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { isValid: false as const, error: "Invalid PDF link signature" };
  }

  return {
    isValid: true as const,
    documentType: documentType as SharedDocumentType,
    documentId,
  };
}