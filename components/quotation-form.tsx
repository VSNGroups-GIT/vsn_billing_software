"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

interface Client {
  id: string;
  name: string;
  email: string;
  due_days?: number | null;
  due_days_type?: string | null;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  unit_price: string;
  paper_price: string;
  tax_rate: string;
}

interface ClientProductPricing {
  product_id: string;
  client_id: string;
  price_rule_type: string;
  price_rule_value: string;
  fixed_base_value?: number | null;
  conditional_threshold?: number | null;
  conditional_discount_below?: number | null;
  conditional_discount_above_equal?: number | null;
}

interface QuotationItem {
  product_id: string | null;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number;
}

interface QuotationFormProps {
  clients: Client[];
  products: Product[];
  clientPricingRules: ClientProductPricing[];
  lastQuotationNumber?: string | null;
  initialQuotation?: {
    id: string;
    client_id: string;
    quotation_number: string;
    quotation_type: "whatsapp" | "other";
    issue_date: string;
    due_date: string;
    notes: string | null;
    status: string;
  };
  initialItems?: Array<{
    product_id: string | null;
    description: string;
    quantity: number | null;
    unit_price: number | null;
    line_total: number;
  }>;
}

const sanitizeQuotationNumberInput = (value: string) =>
  value.replace(/[^A-Za-z0-9-]/g, "");

const getNextQuotationNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return sanitizeQuotationNumberInput(trimmed);

  const prefix = match[1];
  const numericPart = match[2];
  const nextValue = (Number(numericPart) + 1)
    .toString()
    .padStart(numericPart.length, "0");

  return sanitizeQuotationNumberInput(`${prefix}${nextValue}`);
};

function calculateLineTotal(item: Omit<QuotationItem, "line_total">) {
  return Math.max(0, Number(item.quantity || 0) * Number(item.unit_price || 0));
}

export function QuotationForm({
  clients,
  products,
  clientPricingRules,
  lastQuotationNumber,
  initialQuotation,
  initialItems,
}: QuotationFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const defaultDue = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const computeDueDate = (
    issueDate: string,
    days: number | null | undefined,
  ) => {
    const base = issueDate ? new Date(issueDate) : new Date();
    const increment = Number.isFinite(days ?? null) ? Number(days ?? 0) : 0;
    base.setDate(base.getDate() + increment);
    return base.toISOString().split("T")[0];
  };

  const computeDueDateByType = (
    issueDate: string,
    daysType: string | null | undefined,
    days: number | null | undefined,
  ) => {
    if (daysType === "end_of_month") {
      const base = issueDate ? new Date(issueDate) : new Date();
      const extraMonths = Number.isFinite(days ?? null) ? Number(days ?? 0) : 0;
      base.setMonth(base.getMonth() + extraMonths + 1, 0);
      return base.toISOString().split("T")[0];
    }

    return computeDueDate(issueDate, days);
  };

  const [formData, setFormData] = useState({
    client_id: initialQuotation?.client_id || "",
    quotation_number:
      initialQuotation?.quotation_number ||
      (lastQuotationNumber
        ? getNextQuotationNumber(lastQuotationNumber)
        : "Q-0001"),
    quotation_type: initialQuotation?.quotation_type || "other",
    issue_date: initialQuotation?.issue_date || today,
    due_date: initialQuotation?.due_date || defaultDue,
    notes: initialQuotation?.notes || "",
  });

  const [items, setItems] = useState<QuotationItem[]>(
    initialItems?.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      line_total: Number(item.line_total),
    })) || [],
  );

  const calculateClientPrice = (productId: string, clientId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return 0;

    const pricingRule = clientPricingRules.find(
      (rule) => rule.product_id === productId && rule.client_id === clientId,
    );

    if (!pricingRule) return Number(product.unit_price || 0);

    let basePrice = Number(product.paper_price || product.unit_price || 0);
    if (pricingRule.fixed_base_value != null) {
      basePrice = Number(pricingRule.fixed_base_value);
    }

    const ruleValue = Number(pricingRule.price_rule_value || 0);
    switch (pricingRule.price_rule_type) {
      case "discount_percentage":
        return Math.max(0, basePrice * (1 - ruleValue / 100));
      case "discount_flat":
        return Math.max(0, basePrice - ruleValue);
      case "multiplier":
        return Math.max(0, basePrice * ruleValue);
      case "flat_addition":
        return Math.max(0, basePrice + ruleValue);
      case "conditional_discount": {
        const threshold = Number(pricingRule.conditional_threshold || 0);
        const below = Number(pricingRule.conditional_discount_below || 0);
        const aboveEqual = Number(
          pricingRule.conditional_discount_above_equal || 0,
        );
        const selectedDiscount = basePrice >= threshold ? aboveEqual : below;
        return Math.max(0, basePrice - selectedDiscount);
      }
      default:
        return Math.max(0, basePrice);
    }
  };

  const handleClientChange = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    const dueDays = Number(client?.due_days ?? 30);
    const dueDaysType = client?.due_days_type ?? "fixed_days";
    const nextDue = computeDueDateByType(formData.issue_date, dueDaysType, dueDays);

    setFormData((prev) => ({
      ...prev,
      client_id: clientId,
      due_date: nextDue,
    }));

    // Recalculate unit rates based on selected client pricing.
    setItems((prev) =>
      prev.map((item) => {
        if (!item.product_id) return item;
        const unitPrice = calculateClientPrice(item.product_id, clientId);
        return {
          ...item,
          unit_price: unitPrice,
          line_total: calculateLineTotal({ ...item, unit_price: unitPrice }),
        };
      }),
    );
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        product_id: null,
        description: "",
        quantity: null,
        unit_price: null,
        line_total: 0,
      },
    ]);
  };

  const updateItem = (index: number, updates: Partial<QuotationItem>) => {
    setItems((prev) => {
      const next = [...prev];
      const current = { ...next[index], ...updates };
      current.line_total = calculateLineTotal(current);
      next[index] = current;
      return next;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0),
      0,
    );
    return { subtotal, total_amount: subtotal };
  }, [items]);

  const clientOptions = useMemo(
    () =>
      clients.map((client) => ({
        value: client.id,
        label: client.name,
      })),
    [clients],
  );

  const quotationTypeOptions = [
    { value: "whatsapp", label: "WhatsApp quotation" },
    { value: "other", label: "Other quotation" },
  ];

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
      })),
    [products],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (!formData.client_id) {
        throw new Error("Client is required");
      }

      const cleanItems = items.filter(
        (item) => item.product_id && Number(item.quantity) > 0,
      );
      if (cleanItems.length === 0) {
        throw new Error("Add at least one valid line item");
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be logged in");

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) {
        throw new Error("User must belong to an organization");
      }

      let quotationId = initialQuotation?.id;

      if (!quotationId) {
        // Always allocate the next number in DB to avoid RLS visibility collisions.
        const { data: generatedQuotationNumber, error: generateNumberError } =
          await supabase.rpc("next_document_number", {
            p_doc_type: "quotation",
          });

        if (generateNumberError || !generatedQuotationNumber) {
          throw generateNumberError || new Error("Failed to generate quotation number");
        }

        const quotationNumber = String(generatedQuotationNumber);

        const { data: created, error: createError } = await supabase
          .from("quotations")
          .insert({
            quotation_number: quotationNumber,
            reference_number: `QREF-${Date.now()}`,
            client_id: formData.client_id,
            quotation_type: formData.quotation_type,
            issue_date: formData.issue_date,
            due_date: formData.due_date,
            status: "recorded",
            subtotal: totals.subtotal,
            total_amount: totals.total_amount,
            notes: formData.notes || null,
            organization_id: profile.organization_id,
            created_by: user.id,
          })
          .select("id")
          .single();

        if (createError) throw createError;
        quotationId = created.id;
      } else {
        if (initialQuotation?.status === "converted") {
          throw new Error("Converted quotations cannot be edited");
        }

        const { error: updateError } = await supabase
          .from("quotations")
          .update({
            client_id: formData.client_id,
            quotation_type: formData.quotation_type,
            issue_date: formData.issue_date,
            due_date: formData.due_date,
            subtotal: totals.subtotal,
            total_amount: totals.total_amount,
            notes: formData.notes || null,
          })
          .eq("id", quotationId);

        if (updateError) throw updateError;

        await supabase.from("quotation_items").delete().eq("quotation_id", quotationId);
      }

      const itemsToInsert = cleanItems.map((item) => ({
        quotation_id: quotationId,
        product_id: item.product_id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
      }));

      const { error: itemsError } = await supabase
        .from("quotation_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast({
        variant: "success",
        title: initialQuotation ? "Quotation updated" : "Quotation created",
      });

      router.push(`/dashboard/quotations/${quotationId}`);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      setError(msg);
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Quotation Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Client</Label>
              <SearchableSelect
                value={formData.client_id}
                onValueChange={handleClientChange}
                options={clientOptions}
                placeholder="Select client..."
                searchPlaceholder="Search client..."
                emptyText="No client found."
                triggerClassName="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label>Quotation Number</Label>
              <Input
                value={formData.quotation_number}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    quotation_number: sanitizeQuotationNumberInput(e.target.value),
                  }))
                }
                placeholder={
                  initialQuotation?.id ? "Quotation number" : "Auto-generated on save"
                }
                disabled
              />
              <p className="text-xs text-muted-foreground">
                {initialQuotation?.id
                  ? "Quotation number cannot be changed"
                  : "Quotation number is auto-generated when you save."}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Quotation Type</Label>
              <SearchableSelect
                value={formData.quotation_type}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    quotation_type: value as "whatsapp" | "other",
                  }))
                }
                options={quotationTypeOptions}
                triggerClassName="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label>Issue Date</Label>
              <Input
                type="date"
                value={formData.issue_date}
                onChange={(e) => {
                  const nextIssueDate = e.target.value;
                  const selectedClient = clients.find((c) => c.id === formData.client_id);
                  const dueDays = Number(selectedClient?.due_days ?? 30);
                  const dueDaysType = selectedClient?.due_days_type ?? "fixed_days";
                  const nextDueDate = computeDueDateByType(
                    nextIssueDate,
                    dueDaysType,
                    dueDays,
                  );

                  setFormData((prev) => ({
                    ...prev,
                    issue_date: nextIssueDate,
                    due_date: nextDueDate,
                  }));
                }}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Line Items</CardTitle>
          <Button type="button" variant="outline" onClick={addItem}>
            Add Item
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">No items added yet.</p>
          )}

          {items.map((item, index) => (
            <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-10">
              <div className="md:col-span-3">
                <Label className="text-xs">Product</Label>
                <SearchableSelect
                  value={item.product_id || ""}
                  onValueChange={(value) => {
                    const productId = value || null;
                    const product = products.find((p) => p.id === productId);
                    const unitPrice =
                      productId && formData.client_id
                        ? calculateClientPrice(productId, formData.client_id)
                        : Number(product?.unit_price || 0);

                    updateItem(index, {
                      product_id: productId,
                      description: product?.description || product?.name || "",
                      unit_price: unitPrice,
                    });
                  }}
                  options={productOptions}
                  placeholder="Select..."
                  searchPlaceholder="Search product..."
                  emptyText="No product found."
                  triggerClassName="mt-1 h-9 text-sm"
                />
              </div>

              <div className="md:col-span-3">
                <Label className="text-xs">Description</Label>
                <Input
                  className="mt-1 h-9"
                  value={item.description}
                  onChange={(e) => updateItem(index, { description: e.target.value })}
                />
              </div>

              <div className="md:col-span-1">
                <Label className="text-xs">Qty</Label>
                <Input
                  className="mt-1 h-9"
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.quantity ?? ""}
                  onChange={(e) =>
                    updateItem(index, {
                      quantity: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="md:col-span-2">
                <Label className="text-xs">Rate</Label>
                <Input
                  className="mt-1 h-9"
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unit_price ?? ""}
                  onChange={(e) =>
                    updateItem(index, {
                      unit_price: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="md:col-span-1 flex items-end gap-2">
                <div className="flex-1 text-right text-sm font-semibold">
                  Rs. {item.line_total.toFixed(2)}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(index)}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-2 text-sm md:max-w-sm md:ml-auto">
            <div className="flex justify-between font-bold text-base"><span>Total</span><span>Rs. {totals.total_amount.toFixed(2)}</span></div>
          </div>

          {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

          <div className="mt-4 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : initialQuotation ? "Update Quotation" : "Create Quotation"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
