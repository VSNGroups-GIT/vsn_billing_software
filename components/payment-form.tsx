"use client";

import type React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ClientSelector } from "@/components/client-selector";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const paymentMethodOptions = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit Card" },
  { value: "other", label: "Other" },
];

const paymentStatusOptions = [
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: string;
  amount_paid: string;
  status: string;
  issue_date?: string;
  client_id?: string;
  clients?: { name: string } | { name: string }[];
}

interface Client {
  id: string;
  name: string;
  through_mediator?: boolean | null;
}

interface PaymentFormProps {
  invoices: Invoice[];
  clients?: Client[];
  preSelectedInvoiceId?: string;
  preSelectedClientId?: string;
}

export function PaymentForm({
  invoices,
  clients = [],
  preSelectedInvoiceId,
  preSelectedClientId,
}: PaymentFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    preSelectedClientId || null,
  );
  const [paymentMode, setPaymentMode] = useState<"individual" | "bulk">(
    preSelectedInvoiceId ? "individual" : "bulk",
  );
  const [autoFilledInvoiceId, setAutoFilledInvoiceId] = useState<string | null>(
    null,
  );

  const [formData, setFormData] = useState({
    invoice_id: preSelectedInvoiceId || "",
    amount: "",
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "bank_transfer",
    reference_number: "",
    status: "completed",
    notes: "",
    tds_amount: "",
    mediator_deduction_type: "percentage",
    mediator_percentage: "",
    mediator_amount: "",
  });

  const invoiceById = useMemo(() => {
    const lookup = new Map<string, Invoice>();
    for (const invoice of invoices) {
      lookup.set(invoice.id, invoice);
    }
    return lookup;
  }, [invoices]);

  const clientInvoices = useMemo(
    () => (selectedClientId ? invoices.filter((inv) => inv.client_id === selectedClientId) : invoices),
    [invoices, selectedClientId],
  );

  const clientById = useMemo(() => {
    const lookup = new Map<string, Client>();
    for (const client of clients) {
      lookup.set(client.id, client);
    }
    return lookup;
  }, [clients]);

  const activeClientId =
    paymentMode === "bulk" ? selectedClientId : selectedInvoice?.client_id || null;
  const activeClient = activeClientId ? clientById.get(activeClientId) : null;
  const isMediatorClient = Boolean(activeClient?.through_mediator);

  const invoiceOptions = useMemo(
    () =>
      invoices.map((invoice) => {
        const invoiceBalance = Number(invoice.total_amount) - Number(invoice.amount_paid);
        const clientName = Array.isArray(invoice.clients)
          ? invoice.clients[0]?.name
          : invoice.clients?.name;

        return {
          value: invoice.id,
          label: `${invoice.invoice_number} - ${clientName || "Unknown client"} (₹${invoiceBalance.toFixed(2)} due)`,
        };
      }),
    [invoices],
  );

  const {
    clientOutstandingInvoices,
    clientTotalPending,
    clientTotalInvoiced,
    clientTotalPaid,
  } = useMemo(() => {
    let totalPending = 0;
    let totalInvoiced = 0;
    let totalPaid = 0;
    const outstanding: Array<Invoice & { pending: number }> = [];

    for (const inv of clientInvoices) {
      const invoiceTotal = Number(inv.total_amount);
      const invoicePaid = Number(inv.amount_paid);
      const pending = invoiceTotal - invoicePaid;
      totalInvoiced += invoiceTotal;
      totalPaid += invoicePaid;
      totalPending += pending;

      if (pending > 0) {
        outstanding.push({ ...inv, pending });
      }
    }

    outstanding.sort(
      (a, b) =>
        new Date(a.issue_date || "").getTime() -
        new Date(b.issue_date || "").getTime(),
    );

    return {
      clientOutstandingInvoices: outstanding,
      clientTotalPending: totalPending,
      clientTotalInvoiced: totalInvoiced,
      clientTotalPaid: totalPaid,
    };
  }, [clientInvoices]);

  // Auto-generate reference number for cash payments
  useEffect(() => {
    if (formData.payment_method === "cash") {
      const timestamp = Date.now();
      const randomNum = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0");
      const cashRef = `CASH-${timestamp}-${randomNum}`;
      setFormData((prev) => ({ ...prev, reference_number: cashRef }));
    } else {
      // Clear reference number when switching away from cash
      setFormData((prev) => ({ ...prev, reference_number: "" }));
    }
  }, [formData.payment_method]);

  // Set selected invoice when invoice_id changes
  useEffect(() => {
    if (formData.invoice_id) {
      const invoice = invoiceById.get(formData.invoice_id);
      setSelectedInvoice(invoice || null);

      // Auto-fill only once per invoice selection if the field is empty; allow clearing thereafter
      if (
        invoice &&
        formData.amount === "" &&
        autoFilledInvoiceId !== formData.invoice_id
      ) {
        const balance =
          Number(invoice.total_amount) - Number(invoice.amount_paid);
        setFormData((prev) => ({ ...prev, amount: balance.toFixed(2) }));
        setAutoFilledInvoiceId(formData.invoice_id);
      }
    }
  }, [formData.invoice_id, invoiceById, formData.amount, autoFilledInvoiceId]);

  useEffect(() => {
    if (!isMediatorClient) {
      setFormData((prev) => ({
        ...prev,
        mediator_percentage: "",
        mediator_amount: "",
      }));
    }
  }, [isMediatorClient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const supabase = createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast({
        variant: "destructive",
        title: "Authentication required",
        description: "You must be logged in to record payments.",
      });
      setIsLoading(false);
      return;
    }

    try {
      // Get user's organization
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) {
        throw new Error("User must belong to an organization");
      }

      const paymentAmount = Number(formData.amount);
      const tdsAmount = Number(formData.tds_amount || 0);
      const totalPaymentContribution = Number(
        (paymentAmount + Math.max(0, tdsAmount)).toFixed(2),
      );
      const mediatorPercent = Number(formData.mediator_percentage || 0);
      const mediatorAmountInput = Number(formData.mediator_amount || 0);

      if (tdsAmount < 0) {
        throw new Error("TDS amount cannot be negative.");
      }

      if (isMediatorClient && formData.mediator_deduction_type === "percentage") {
        if (mediatorPercent < 0 || mediatorPercent > 100) {
          throw new Error("Mediator percentage must be between 0 and 100.");
        }
      }

      if (isMediatorClient && formData.mediator_deduction_type === "amount") {
        if (mediatorAmountInput < 0 || mediatorAmountInput > paymentAmount) {
          throw new Error("Mediator amount cannot exceed payment amount.");
        }
      }

      const mediatorDeductionAmount = isMediatorClient
        ? formData.mediator_deduction_type === "percentage"
          ? Number(((paymentAmount * mediatorPercent) / 100).toFixed(2))
          : Number(mediatorAmountInput.toFixed(2))
        : 0;
      const netAmount = Number((paymentAmount - mediatorDeductionAmount).toFixed(2));

      if (paymentMode === "bulk" && selectedClientId) {
        // Bulk payment mode: allocate payment to client's unpaid invoices
        let remainingAmount = totalPaymentContribution;
        const unpaidInvoices = clientOutstandingInvoices;

        // Create a single payment record for tracking
        const { error: paymentError } = await supabase.from("payments").insert({
          invoice_id: unpaidInvoices[0]?.id || formData.invoice_id, // Link to first unpaid invoice
          amount: formData.amount,
          tds_amount: tdsAmount,
          mediator_deduction_type: isMediatorClient
            ? formData.mediator_deduction_type
            : null,
          mediator_percentage: isMediatorClient
            ? (formData.mediator_deduction_type === "percentage"
              ? mediatorPercent
              : null)
            : null,
          mediator_amount: mediatorDeductionAmount,
          net_amount: netAmount,
          payment_date: formData.payment_date,
          payment_method: formData.payment_method,
          reference_number: formData.reference_number || null,
          status: formData.status,
          notes: `Bulk payment for client - allocated across ${unpaidInvoices.length} invoices. ${formData.notes || ""}`,
          created_by: user.id,
          organization_id: profile.organization_id,
        });

        if (paymentError) throw paymentError;

        // Allocate payment across invoices
        for (const invoice of unpaidInvoices) {
          if (remainingAmount <= 0) break;

          const pending =
            Number(invoice.total_amount) - Number(invoice.amount_paid);
          const allocationAmount = Math.min(remainingAmount, pending);

          const newAmountPaid = Number(invoice.amount_paid) + allocationAmount;
          const totalAmount = Number(invoice.total_amount);
          const paidOff = newAmountPaid >= totalAmount - 0.01;
          let newStatus = invoice.status;
          if (paidOff) {
            newStatus = "paid";
          } else if (newAmountPaid > 0) {
            newStatus = "partially_paid";
          }

          const { error: invoiceError } = await supabase
            .from("invoices")
            .update({
              amount_paid: newAmountPaid,
              status: newStatus,
            })
            .eq("id", invoice.id);

          if (invoiceError) throw invoiceError;
          remainingAmount -= allocationAmount;
        }

        toast({
          variant: "success",
          title: "Bulk payment recorded",
          description: `₹${totalPaymentContribution.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (including TDS) allocated across ${unpaidInvoices.length} invoices.`,
        });
      } else {
        // Individual invoice payment mode
        if (!selectedInvoice) throw new Error("Please select an invoice");

        // Insert payment
        const { error: paymentError } = await supabase.from("payments").insert({
          invoice_id: formData.invoice_id,
          amount: formData.amount,
          tds_amount: tdsAmount,
          mediator_deduction_type: isMediatorClient
            ? formData.mediator_deduction_type
            : null,
          mediator_percentage: isMediatorClient
            ? (formData.mediator_deduction_type === "percentage"
              ? mediatorPercent
              : null)
            : null,
          mediator_amount: mediatorDeductionAmount,
          net_amount: netAmount,
          payment_date: formData.payment_date,
          payment_method: formData.payment_method,
          reference_number: formData.reference_number || null,
          status: formData.status,
          notes: formData.notes || null,
          created_by: user.id,
          organization_id: profile.organization_id,
        });

        if (paymentError) throw paymentError;

        // Update invoice amount_paid
        const newAmountPaid =
          Number(selectedInvoice.amount_paid) + totalPaymentContribution;
        const totalAmount = Number(selectedInvoice.total_amount);
        const paidOff = newAmountPaid >= totalAmount - 0.01;

        // Determine new status
        let newStatus = "recorded";
        if (paidOff) {
          newStatus = "paid";
        } else if (newAmountPaid > 0) {
          newStatus = "partially_paid";
        }

        const { error: invoiceError } = await supabase
          .from("invoices")
          .update({
            amount_paid: newAmountPaid,
            status: newStatus,
          })
          .eq("id", formData.invoice_id);

        if (invoiceError) throw invoiceError;
      }

      toast({
        variant: "success",
        title: "Payment recorded",
        description:
          isMediatorClient && mediatorDeductionAmount > 0
            ? `Paid ₹${paymentAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, TDS ₹${tdsAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, mediator deduction ₹${mediatorDeductionAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, net received ₹${netAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
            : `Paid ₹${paymentAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + TDS ₹${tdsAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} recorded successfully.`,
      });

      router.push("/dashboard/payments");
      router.refresh();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "An error occurred while recording payment",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const balance = selectedInvoice
    ? Number(selectedInvoice.total_amount) - Number(selectedInvoice.amount_paid)
    : 0;
  const paymentAmount = Number(formData.amount) || 0;
  const tdsAmount = Number(formData.tds_amount) || 0;
  const totalPaymentContribution = paymentAmount + tdsAmount;
  const mediatorDeductionAmount = isMediatorClient
    ? formData.mediator_deduction_type === "percentage"
      ? Number(
          (
            (paymentAmount * Number(formData.mediator_percentage || 0)) /
            100
          ).toFixed(2),
        )
      : Number(Number(formData.mediator_amount || 0).toFixed(2))
    : 0;
  const netReceivedAmount = Math.max(0, paymentAmount - mediatorDeductionAmount);
  const remainingBalance = balance - totalPaymentContribution;

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Payment Mode Selector */}
          <Tabs
            value={paymentMode}
            onValueChange={(value) =>
              setPaymentMode(value as "individual" | "bulk")
            }
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="individual">Single Invoice</TabsTrigger>
              <TabsTrigger value="bulk">Bulk Payment</TabsTrigger>
            </TabsList>

            <TabsContent value="bulk" className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="client_id">
                  Select Client <span className="text-red-500">*</span>
                </Label>
                <div className="max-w-xs">
                  <ClientSelector
                    clients={clients}
                    selectedClientId={selectedClientId}
                    onClientChange={setSelectedClientId}
                  />
                </div>
              </div>

              {selectedClientId && (
                <>
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                    <h4 className="font-semibold text-amber-900 mb-2">
                      Client's Outstanding Invoices
                    </h4>
                    <div className="space-y-2">
                      {clientOutstandingInvoices.map((inv) => {
                          const pending = inv.pending;
                          return (
                            <div
                              key={inv.id}
                              className="flex justify-between items-center text-sm pb-2 border-b border-amber-200 last:border-b-0"
                            >
                              <span className="font-medium">
                                {inv.invoice_number}
                              </span>
                              <span className="text-amber-700 font-semibold">
                                ₹{pending.toFixed(2)} due
                              </span>
                            </div>
                          );
                        })}
                    </div>
                    <div className="border-t border-amber-300 pt-3 mt-3">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-amber-900">
                          Total Pending:
                        </span>
                        <span className="text-lg font-bold text-amber-700">
                          ₹{clientTotalPending.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                    <h4 className="font-semibold text-blue-900 mb-2">
                      Payment Summary
                    </h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-700">
                        Total Invoices Amount:
                      </span>
                      <span className="font-medium">
                        ₹
                        {clientTotalInvoiced.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-700">Already Paid:</span>
                      <span className="font-medium">
                        ₹{clientTotalPaid.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-bold border-t border-blue-300 pt-2">
                      <span className="text-blue-900">
                        Current Balance Due:
                      </span>
                      <span className="text-red-600">
                        ₹{clientTotalPending.toFixed(2)}
                      </span>
                    </div>

                    {paymentAmount > 0 || tdsAmount > 0 ? (
                      <div className="mt-3 pt-3 border-t border-blue-300">
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-700">Payment Amount:</span>
                          <span className="font-medium text-green-600">
                            ₹{paymentAmount.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-700">TDS:</span>
                          <span className="font-medium text-green-600">
                            ₹{tdsAmount.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-700">Total Considered:</span>
                          <span className="font-medium text-green-700">
                            ₹{totalPaymentContribution.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm font-bold mt-2">
                          <span className="text-blue-900">
                            Remaining Balance:
                          </span>
                          <span
                            className={
                              clientTotalPending - totalPaymentContribution > 0
                                ? "text-orange-600"
                                : "text-green-600"
                            }
                          >
                            ₹
                            {(clientTotalPending - totalPaymentContribution).toFixed(2)}
                          </span>
                        </div>
                        {clientTotalPending - totalPaymentContribution === 0 && (
                          <p className="text-xs text-green-600 mt-1">
                            ✓ All invoices will be fully paid
                          </p>
                        )}
                        {clientTotalPending - totalPaymentContribution > 0 && (
                          <p className="text-xs text-orange-600 mt-1">
                            ⚠ Partial payment - balance remains
                          </p>
                        )}
                      </div>
                    ) : null}

                    <div className="pt-3 border-t border-blue-300">
                      <p className="text-sm text-blue-700">
                        The payment amount will be automatically distributed
                        across unpaid invoices, starting with the oldest
                        invoice.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="individual" className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="invoice_id">
                  Invoice <span className="text-red-500">*</span>
                </Label>
                <SearchableSelect
                  id="invoice_id"
                  value={formData.invoice_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, invoice_id: value, amount: "" })
                  }
                  options={invoiceOptions}
                  placeholder="Select an invoice"
                  searchPlaceholder="Type invoice number or client..."
                />
              </div>

              {selectedInvoice && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <h4 className="font-semibold text-blue-900 mb-2">
                    Invoice Summary
                  </h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-700">Invoice Total:</span>
                    <span className="font-medium">
                      ₹{Number(selectedInvoice.total_amount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-700">Already Paid:</span>
                    <span className="font-medium">
                      ₹{Number(selectedInvoice.amount_paid).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-blue-300 pt-2">
                    <span className="text-blue-900">Current Balance Due:</span>
                    <span className="text-red-600">₹{balance.toFixed(2)}</span>
                  </div>

                  {paymentAmount > 0 && (
                    <div className="mt-3 pt-3 border-t border-blue-300">
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-700">Payment Amount:</span>
                        <span className="font-medium text-green-600">
                          ₹{paymentAmount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-700">TDS:</span>
                        <span className="font-medium text-green-600">
                          ₹{tdsAmount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-700">Total Considered:</span>
                        <span className="font-medium text-green-700">
                          ₹{totalPaymentContribution.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-bold mt-2">
                        <span className="text-blue-900">
                          Remaining Balance:
                        </span>
                        <span
                          className={
                            remainingBalance > 0
                              ? "text-orange-600"
                              : "text-green-600"
                          }
                        >
                          ₹{remainingBalance.toFixed(2)}
                        </span>
                      </div>
                      {remainingBalance === 0 && (
                        <p className="text-xs text-green-600 mt-1">
                          ✓ Invoice will be fully paid
                        </p>
                      )}
                      {remainingBalance > 0 && (
                        <p className="text-xs text-orange-600 mt-1">
                          ⚠ Partial payment - balance remains
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">
                Payment Amount <span className="text-red-500">*</span>
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={
                  paymentMode === "bulk"
                    ? clientTotalPending
                    : balance > 0
                      ? balance
                      : undefined
                }
                required
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                placeholder="Enter amount"
              />
              <p className="text-xs text-muted-foreground">
                {paymentMode === "bulk" ? (
                  <>
                    Maximum: ₹{clientTotalPending.toFixed(2)} |{" "}
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          amount: Math.max(
                            0,
                            clientTotalPending - tdsAmount,
                          ).toFixed(2),
                        })
                      }
                      className="ml-1 text-blue-600 hover:underline"
                    >
                      Full Amount (after TDS)
                    </button>
                  </>
                ) : (
                  <>
                    Maximum: ₹{balance.toFixed(2)} |{" "}
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          amount: Math.max(0, balance - tdsAmount).toFixed(2),
                        })
                      }
                      className="ml-1 text-blue-600 hover:underline"
                    >
                      Pay Full Amount (after TDS)
                    </button>
                  </>
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tds_amount">TDS (Optional)</Label>
              <Input
                id="tds_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.tds_amount}
                onChange={(e) =>
                  setFormData({ ...formData, tds_amount: e.target.value })
                }
                placeholder="Enter TDS amount"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_date">
                Payment Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="payment_date"
                type="date"
                required
                value={formData.payment_date}
                onChange={(e) =>
                  setFormData({ ...formData, payment_date: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_method">
                Payment Method <span className="text-red-500">*</span>
              </Label>
              <SearchableSelect
                id="payment_method"
                value={formData.payment_method}
                onValueChange={(value) =>
                  setFormData({ ...formData, payment_method: value })
                }
                options={paymentMethodOptions}
                placeholder="Select payment method"
                searchPlaceholder="Type payment method..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference_number">Reference Number</Label>
              <Input
                id="reference_number"
                value={formData.reference_number}
                onChange={(e) =>
                  setFormData({ ...formData, reference_number: e.target.value })
                }
                placeholder="Transaction ID, Check #, etc."
              />
            </div>
          </div>

          {isMediatorClient && (
            <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h4 className="font-semibold text-amber-900">
                Mediator Deduction
              </h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mediator_deduction_type">
                    Deduction Type
                  </Label>
                  <SearchableSelect
                    id="mediator_deduction_type"
                    value={formData.mediator_deduction_type}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        mediator_deduction_type: value,
                        mediator_percentage:
                          value === "percentage"
                            ? formData.mediator_percentage
                            : "",
                        mediator_amount:
                          value === "amount" ? formData.mediator_amount : "",
                      })
                    }
                    options={[
                      { value: "percentage", label: "Percentage (%)" },
                      { value: "amount", label: "Fixed Amount (Rs.)" },
                    ]}
                    placeholder="Select deduction type"
                    searchPlaceholder="Type deduction type..."
                  />
                </div>
                <div className="space-y-2">
                  {formData.mediator_deduction_type === "percentage" ? (
                    <>
                      <Label htmlFor="mediator_percentage">Mediator %</Label>
                      <Input
                        id="mediator_percentage"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={formData.mediator_percentage}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            mediator_percentage: e.target.value,
                          })
                        }
                        placeholder="e.g. 5"
                      />
                    </>
                  ) : (
                    <>
                      <Label htmlFor="mediator_amount">Mediator Amount</Label>
                      <Input
                        id="mediator_amount"
                        type="number"
                        min="0"
                        max={paymentAmount || undefined}
                        step="0.01"
                        value={formData.mediator_amount}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            mediator_amount: e.target.value,
                          })
                        }
                        placeholder="e.g. 250.00"
                      />
                    </>
                  )}
                </div>
              </div>
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <div className="flex justify-between rounded-md bg-white p-2">
                  <span className="text-muted-foreground">Deduction</span>
                  <span className="font-medium text-amber-700">
                    ₹{mediatorDeductionAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between rounded-md bg-white p-2">
                  <span className="text-muted-foreground">Net Received</span>
                  <span className="font-semibold text-green-700">
                    ₹{netReceivedAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="status">
              Payment Status <span className="text-red-500">*</span>
            </Label>
            <SearchableSelect
              id="status"
              value={formData.status}
              onValueChange={(value) =>
                setFormData({ ...formData, status: value })
              }
              options={paymentStatusOptions}
              placeholder="Select status"
              searchPlaceholder="Type payment status..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              placeholder="Additional notes about this payment..."
              rows={3}
            />
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              type="submit"
              disabled={
                isLoading ||
                !formData.amount ||
                (paymentMode === "individual" && !formData.invoice_id) ||
                (paymentMode === "bulk" && !selectedClientId)
              }
              className="min-w-36"
            >
              {isLoading ? (
                <>
                  <Spinner className="mr-2" />
                  Recording...
                </>
              ) : (
                "Record Payment"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
