export const BULK_PAYMENT_NOTE_PREFIX = "Bulk payment for client";

export function buildBulkPaymentNotes(
  batchId: string,
  invoiceCount: number,
  userNotes?: string | null,
) {
  const trimmed = userNotes?.trim();
  return `${BULK_PAYMENT_NOTE_PREFIX} [batch:${batchId}] - allocated across ${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"}.${trimmed ? ` ${trimmed}` : ""}`;
}

export function parseBulkBatchId(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/\[batch:([^\]]+)\]/);
  return match?.[1] ?? null;
}

export function isBulkPayment(notes: string | null | undefined): boolean {
  return Boolean(notes?.includes(BULK_PAYMENT_NOTE_PREFIX));
}

export function getPaymentContribution(payment: {
  amount: string | number | null;
  tds_amount?: string | number | null;
}): number {
  return Number(payment.amount || 0) + Number(payment.tds_amount || 0);
}

export function computeInvoiceStatus(
  amountPaid: number,
  totalAmount: number,
): "recorded" | "partially_paid" | "paid" {
  if (amountPaid <= 0) return "recorded";
  if (amountPaid >= totalAmount - 0.01) return "paid";
  return "partially_paid";
}

export function splitBulkContribution(
  allocationAmount: number,
  cashAmount: number,
  tdsAmount: number,
  totalContribution: number,
): { amount: number; tds_amount: number } {
  if (totalContribution <= 0) {
    return { amount: allocationAmount, tds_amount: 0 };
  }

  const cashShare = cashAmount / totalContribution;
  const tdsShare = tdsAmount / totalContribution;

  return {
    amount: Number((allocationAmount * cashShare).toFixed(2)),
    tds_amount: Number((allocationAmount * tdsShare).toFixed(2)),
  };
}
