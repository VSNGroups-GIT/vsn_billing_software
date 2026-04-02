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
import { useState } from "react";

interface OperatorInvoiceSummary {
  id: string;
  invoice_number: string;
  total_amount: number;
  amount_paid: number;
  operators: { name: string } | null;
}

interface OperatorPaymentFormProps {
  invoice: OperatorInvoiceSummary;
}

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Cheque" },
  { value: "credit_card", label: "Credit Card" },
  { value: "other", label: "Other" },
];

export function OperatorPaymentForm({ invoice }: OperatorPaymentFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const today = new Date().toISOString().split("T")[0];

  const balance = invoice.total_amount - invoice.amount_paid;

  const [formData, setFormData] = useState({
    amount: balance.toFixed(2),
    payment_date: today,
    payment_method: "bank_transfer",
    reference_number: "",
    status: "completed",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast({ variant: "destructive", title: "Authentication required" });
      setIsLoading(false);
      return;
    }

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) throw new Error("User must belong to an organization");

      const amount = parseFloat(formData.amount);

      if (isNaN(amount) || amount <= 0) throw new Error("Invalid payment amount");
      if (amount > balance + 0.01) throw new Error(`Amount exceeds outstanding balance (₹${balance.toFixed(2)})`);

      // Insert payment
      const { error: payError } = await supabase.from("operator_payments").insert({
        operator_invoice_id: invoice.id,
        amount,
        payment_date: formData.payment_date,
        payment_method: formData.payment_method,
        reference_number: formData.reference_number || null,
        status: formData.status,
        notes: formData.notes || null,
        organization_id: profile.organization_id,
        created_by: user.id,
      });

      if (payError) throw payError;

      // Update invoice amount_paid and status
      const newAmountPaid = invoice.amount_paid + amount;
      const newStatus =
        newAmountPaid >= invoice.total_amount - 0.01
          ? "paid"
          : newAmountPaid > 0
            ? "partially_paid"
            : "unpaid";

      const { error: updateError } = await supabase
        .from("operator_invoices")
        .update({ amount_paid: newAmountPaid, status: newStatus })
        .eq("id", invoice.id);

      if (updateError) throw updateError;

      toast({
        variant: "success",
        title: "Payment recorded",
        description: `₹${amount.toFixed(2)} payment recorded for invoice ${invoice.invoice_number}.`,
      });

      router.push(`/dashboard/operators/invoices/${invoice.id}`);
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "An error occurred.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-6 p-4 rounded-lg bg-slate-50 border space-y-1">
          <p className="text-sm font-semibold">{invoice.operators?.name}</p>
          <p className="text-sm text-slate-600">Invoice: {invoice.invoice_number}</p>
          <div className="flex gap-6 text-sm mt-1">
            <span>Total: <strong>₹{invoice.total_amount.toFixed(2)}</strong></span>
            <span className="text-green-700">Paid: <strong>₹{invoice.amount_paid.toFixed(2)}</strong></span>
            <span className="text-red-700">Balance: <strong>₹{balance.toFixed(2)}</strong></span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">
                Amount (₹) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={balance}
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="payment_method">Payment Method</Label>
              <SearchableSelect
                id="payment_method"
                value={formData.payment_method}
                onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
                options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
                triggerClassName="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference_number">Reference Number</Label>
              <Input
                id="reference_number"
                value={formData.reference_number}
                onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                placeholder="UTR / Cheque No."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes..."
              rows={2}
            />
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={isLoading || balance <= 0}>
              {isLoading ? <Spinner className="h-4 w-4 mr-2" /> : null}
              Record Payment
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>

          {balance <= 0 && (
            <p className="text-sm text-green-600 font-medium">This invoice is fully paid.</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
