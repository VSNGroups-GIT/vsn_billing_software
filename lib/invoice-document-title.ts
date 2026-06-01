/**
 * Document heading for printed/shared invoices.
 * Draft invoices remain quotations; GST-registered clients get a tax invoice title.
 */
export function getInvoiceDocumentTitle(
  status: string,
  clientTaxId?: string | null,
): string {
  if (status === "draft") {
    return "QUOTATION";
  }

  if (clientTaxId?.trim()) {
    return "TAX INVOICE";
  }

  return "INVOICE";
}
