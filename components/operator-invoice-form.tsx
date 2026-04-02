"use client";

import type React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { Upload, FileText, X, Sparkles } from "lucide-react";

interface Operator {
  id: string;
  name: string;
}

interface OperatorInvoiceFormProps {
  operators: Operator[];
  initialData?: {
    id: string;
    operator_id: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string | null;
    taxable_amount: number;
    tax_amount: number;
    total_amount: number;
    notes: string | null;
  };
}

export function OperatorInvoiceForm({ operators, initialData }: OperatorInvoiceFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const [formData, setFormData] = useState({
    operator_id: initialData?.operator_id || "",
    invoice_number: initialData?.invoice_number || "",
    invoice_date: initialData?.invoice_date || today,
    due_date: initialData?.due_date || "",
    taxable_amount: initialData?.taxable_amount?.toString() || "",
    tax_amount: initialData?.tax_amount?.toString() || "",
    total_amount: initialData?.total_amount?.toString() || "",
    notes: initialData?.notes || "",
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  const handleAutoParse = async () => {
    if (!selectedFile) {
      toast({ variant: "destructive", title: "No file selected", description: "Please select a PDF first." });
      return;
    }

    setIsParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      const res = await fetch("/api/parse-operator-pdf", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to parse PDF");
      }

      setFormData((prev) => ({
        ...prev,
        invoice_number: data.invoice_number || prev.invoice_number,
        invoice_date: data.invoice_date || prev.invoice_date,
        total_amount: data.total_amount || prev.total_amount,
        tax_amount: data.tax_amount || prev.tax_amount,
        taxable_amount: data.taxable_amount || prev.taxable_amount,
      }));

      toast({
        variant: "success",
        title: "Fields auto-filled",
        description: "Invoice details extracted from PDF. Please verify before saving.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Parse failed",
        description: err instanceof Error ? err.message : "Could not extract data from PDF.",
      });
    } finally {
      setIsParsing(false);
    }
  };

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
      if (!formData.operator_id) throw new Error("Operator is required");

      let fileUrl: string | null = null;
      let fileName: string | null = null;

      // Upload PDF to Supabase Storage if a file was selected
      if (selectedFile) {
        const path = `${profile.organization_id}/${Date.now()}_${selectedFile.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("operator-invoices")
          .upload(path, selectedFile, { upsert: false });

        if (!uploadError && uploadData) {
          const { data: publicUrlData } = supabase.storage
            .from("operator-invoices")
            .getPublicUrl(uploadData.path);
          fileUrl = publicUrlData.publicUrl;
          fileName = selectedFile.name;
        }
        // Don't block save if upload fails — just skip the URL
      }

      const payload = {
        operator_id: formData.operator_id,
        invoice_number: formData.invoice_number,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date || null,
        taxable_amount: parseFloat(formData.taxable_amount) || 0,
        tax_amount: parseFloat(formData.tax_amount) || 0,
        total_amount: parseFloat(formData.total_amount) || 0,
        notes: formData.notes || null,
        organization_id: profile.organization_id,
        created_by: user.id,
        ...(fileUrl ? { file_url: fileUrl, file_name: fileName } : {}),
      };

      if (initialData?.id) {
        const { count: paymentCount, error: paymentCheckError } = await supabase
          .from("operator_payments")
          .select("id", { count: "exact", head: true })
          .eq("operator_invoice_id", initialData.id);

        if (paymentCheckError) throw paymentCheckError;
        if ((paymentCount ?? 0) > 0) {
          throw new Error("Invoice cannot be edited after payment is recorded");
        }

        const { error } = await supabase
          .from("operator_invoices")
          .update(payload)
          .eq("id", initialData.id);
        if (error) throw error;
        toast({ variant: "success", title: "Invoice updated" });
      } else {
        const { error } = await supabase.from("operator_invoices").insert(payload);
        if (error) throw error;
        toast({ variant: "success", title: "Invoice saved", description: `Invoice ${formData.invoice_number} recorded.` });
      }

      router.push("/dashboard/operators/invoices");
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

  const totalFromParts =
    (parseFloat(formData.taxable_amount) || 0) + (parseFloat(formData.tax_amount) || 0);

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* PDF Upload */}
          <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              <p className="text-sm font-semibold text-slate-700">Upload Operator Invoice (PDF)</p>
              <Badge variant="outline" className="text-xs">Optional</Badge>
            </div>
            <p className="text-xs text-slate-500">
              Upload the PDF to auto-extract Invoice No., Date, and Amount fields.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {selectedFile ? "Change File" : "Select PDF"}
                </Button>
                {selectedFile && (
                  <span className="ml-2 text-sm text-slate-600 inline-flex items-center gap-1">
                    {selectedFile.name}
                    <button
                      type="button"
                      onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!selectedFile || isParsing}
                onClick={handleAutoParse}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {isParsing ? <Spinner className="h-4 w-4 mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {isParsing ? "Parsing..." : "Auto-Fill from PDF"}
              </Button>
            </div>
          </div>

          {/* Operator */}
          <div className="space-y-2">
            <Label htmlFor="operator_id">
              Operator <span className="text-red-500">*</span>
            </Label>
            <SearchableSelect
              id="operator_id"
              value={formData.operator_id}
              onValueChange={(value) => setFormData({ ...formData, operator_id: value })}
              options={operators.map((op) => ({ value: op.id, label: op.name }))}
              placeholder="Select operator..."
              searchPlaceholder="Search operator..."
              emptyText="No operator found."
              triggerClassName="h-10"
              disabled={!!initialData?.id}
            />
          </div>

          {/* Invoice Number */}
          <div className="space-y-2">
            <Label htmlFor="invoice_number">
              Invoice Number <span className="text-red-500">*</span>
            </Label>
            <Input
              id="invoice_number"
              required
              value={formData.invoice_number}
              onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
              placeholder="e.g., IN262206007336"
            />
          </div>

          {/* Dates */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invoice_date">
                Invoice Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="invoice_date"
                type="date"
                required
                value={formData.invoice_date}
                onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
          </div>

          {/* Amounts */}
          <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">Invoice Amounts</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="taxable_amount">Taxable Amount (₹)</Label>
                <Input
                  id="taxable_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.taxable_amount}
                  onChange={(e) => setFormData({ ...formData, taxable_amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax_amount">Tax Amount (₹)</Label>
                <Input
                  id="tax_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.tax_amount}
                  onChange={(e) => setFormData({ ...formData, tax_amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total_amount">
                  Total Amount (₹) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="total_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={formData.total_amount}
                  onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                />
              </div>
            </div>
            {totalFromParts > 0 && formData.total_amount && Math.abs(totalFromParts - parseFloat(formData.total_amount)) > 0.01 && (
              <p className="text-xs text-amber-600">
                Note: Taxable + Tax = ₹{totalFromParts.toFixed(2)}, but Total Amount is ₹{parseFloat(formData.total_amount).toFixed(2)}
              </p>
            )}
            {totalFromParts > 0 && !formData.total_amount && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-xs h-7"
                onClick={() => setFormData({ ...formData, total_amount: totalFromParts.toFixed(2) })}
              >
                Use calculated total: ₹{totalFromParts.toFixed(2)}
              </Button>
            )}
          </div>

          {/* Notes */}
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

          {/* Actions */}
          <div className="flex gap-3">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? <Spinner className="h-4 w-4 mr-2" /> : null}
              {initialData?.id ? "Update Invoice" : "Save Invoice"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
