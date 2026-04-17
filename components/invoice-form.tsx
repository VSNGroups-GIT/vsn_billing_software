"use client";

import type React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Check, ChevronDown, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface Client {
  id: string;
  name: string;
  email: string;
  tax_id?: string | null;
  due_days?: number | null;
  due_days_type?: string | null;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  paper_price: string;
  unit_price: string;
  unit: string | null;
  tax_rate: string;
}

interface ClientProductPricing {
  price_rule_type: string;
  price_rule_value: string;
  product_id: string;
  client_id: string;
  price_category_id?: string | null;
  fixed_base_value?: number | null;
  conditional_threshold?: number | null;
  conditional_discount_below?: number | null;
  conditional_discount_above_equal?: number | null;
}

interface InvoiceFormProps {
  clients: Client[];
  products: Product[];
  clientPricingRules: ClientProductPricing[];
  lastInvoiceNumber?: string | null;
  conversionQuotationId?: string | null;
  initialInvoice?: {
    id?: string;
    client_id: string;
    issue_date: string;
    due_date: string;
    due_days_type?: string | null;
    invoice_number: string;
    reference_number?: string | null;
    notes: string | null;
    subtotal?: number | null;
    tax_amount?: number | null;
    discount_amount?: number | null;
    total_amount?: number | null;
    total_birds?: number | null;
    gst_percent?: number | null;
    split_gst?: boolean | null;
  };
  initialItems?: Array<{
    product_id: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    discount: number;
    line_total?: number;
  }>;
}

interface InvoiceItem {
  product_id: string | null;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  tax_rate: number | null;
  discount: number | null;
  line_total: number;
  bird_count?: number | null;
  enabled?: boolean;
  use_per_bird?: boolean;
}

const sanitizeInvoiceNumberInput = (value: string) =>
  value.replace(/[^A-Za-z0-9-]/g, "");

// Format a unit price with up to 8 decimal places, trimming trailing zeros
// but always keeping at least 2 decimal places (e.g. 5.12345678, 5.50, 5.00).
function formatUnitPrice(value: number): string {
  const s = value.toFixed(8);
  const dot = s.indexOf(".");
  let end = s.length;
  while (end > dot + 3 && s[end - 1] === "0") end--;
  return s.slice(0, end);
}

const getNextInvoiceNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return sanitizeInvoiceNumberInput(trimmed);

  const prefix = match[1];
  const numericPart = match[2];
  const nextValue = (Number(numericPart) + 1)
    .toString()
    .padStart(numericPart.length, "0");

  return sanitizeInvoiceNumberInput(`${prefix}${nextValue}`);
};

const shouldDefaultToSplitGst = (taxId?: string | null) => {
  const normalized = (taxId || "").trim().toLowerCase();

  if (!normalized) return true;
  if (normalized.startsWith("37")) return true;
  if (normalized.includes("no gst")) return true;

  return false;
};

export function InvoiceForm({
  clients,
  products,
  clientPricingRules,
  lastInvoiceNumber,
  conversionQuotationId,
  initialInvoice,
  initialItems,
}: InvoiceFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const deriveInvoiceRatesFromInitial = () => {
    if (!initialInvoice || !initialItems || initialItems.length === 0) {
      return { discount_percent: 0, tax_percent: 0 };
    }

    const subtotal = initialItems.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
      0,
    );

    // Calculate line taxes (on original unit price)
    const line_tax_amount = initialItems.reduce((sum, item) => {
      const itemSubtotal = Number(item.quantity) * Number(item.unit_price);
      return sum + (itemSubtotal * Number(item.tax_rate)) / 100;
    }, 0);

    const subtotal_with_taxes = subtotal + line_tax_amount;

    // Calculate line discounts
    const line_discount_amount = initialItems.reduce(
      (sum, item) =>
        sum +
        (Number(item.quantity) *
          Number(item.unit_price) *
          Number(item.discount)) /
          100,
      0,
    );

    // Invoice-level amounts
    const invoice_discount_amount = Math.max(
      0,
      (initialInvoice.discount_amount || 0) - line_discount_amount,
    );
    const invoice_tax_amount = Math.max(
      0,
      (initialInvoice.tax_amount || 0) - line_tax_amount,
    );

    const discount_percent =
      subtotal > 0 ? (invoice_discount_amount / subtotal) * 100 : 0;
    const tax_percent =
      subtotal > 0 ? (invoice_tax_amount / subtotal) * 100 : 0;

    return {
      discount_percent: Number.isFinite(discount_percent)
        ? discount_percent
        : 0,
      tax_percent:
        initialInvoice.gst_percent != null
          ? Number(initialInvoice.gst_percent)
          : Number.isFinite(tax_percent)
            ? tax_percent
            : 0,
    };
  };

  const [invoiceRates, setInvoiceRates] = useState<{
    discount_percent: number | null;
    tax_percent: number | null;
  }>(deriveInvoiceRatesFromInitial);

  const [splitGst, setSplitGst] = useState<boolean>(
    initialInvoice?.split_gst ?? false,
  );

  const today = new Date().toISOString().split("T")[0];
  const defaultDue = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const [selectedDueDays, setSelectedDueDays] = useState<number | null>(null);
  const [selectedDueDaysType, setSelectedDueDaysType] = useState<string | null>(
    null,
  );

  const [formData, setFormData] = useState({
    client_id: initialInvoice?.client_id || "",
    invoice_number:
      initialInvoice?.invoice_number ||
      (lastInvoiceNumber ? getNextInvoiceNumber(lastInvoiceNumber) : ""),
    issue_date: initialInvoice?.issue_date || today,
    due_date: initialInvoice?.due_date || defaultDue,
    due_days_type:
      initialInvoice?.due_days_type || selectedDueDaysType || "fixed_days",
    notes: initialInvoice?.notes || "",
  });
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearchValue, setClientSearchValue] = useState("");
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [productSearchValue, setProductSearchValue] = useState("");

  const clientsById = useMemo(() => {
    const lookup = new Map<string, Client>();
    for (const client of clients) {
      lookup.set(client.id, client);
    }
    return lookup;
  }, [clients]);

  const productsById = useMemo(() => {
    const lookup = new Map<string, Product>();
    for (const product of products) {
      lookup.set(product.id, product);
    }
    return lookup;
  }, [products]);

  const pricingRuleByClientProduct = useMemo(() => {
    const lookup = new Map<string, ClientProductPricing>();
    for (const rule of clientPricingRules) {
      lookup.set(`${rule.client_id}:${rule.product_id}`, rule);
    }
    return lookup;
  }, [clientPricingRules]);

  // ensure per-bird settings from client are loaded when form initialises
  useEffect(() => {
    if (formData.client_id) {
      handleClientChange(formData.client_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [items, setItems] = useState<InvoiceItem[]>(() => {
    if (!initialItems || initialItems.length === 0) return [];
    return initialItems.map((it) => ({
      product_id: it.product_id,
      description: it.description,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      tax_rate: Number(it.tax_rate),
      discount: Number(it.discount),
      bird_count: undefined,
      enabled: true,
      use_per_bird: false,
      line_total: typeof it.line_total === "number" ? Number(it.line_total) : 0,
    }));
  });

  // Track when a duplicate is added to show toast after state settles
  const lastItemCountRef = useRef(items.length);
  const lastItemsRef = useRef(items);
  const quantityInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const previousItemsCountForFocusRef = useRef(items.length);

  useEffect(() => {
    // Only check for duplicates when items increased (new item added)
    if (items.length > lastItemCountRef.current && items.length > 0) {
      const newItem = items[items.length - 1];
      // Check if the newly added item is an exact duplicate
      const isDuplicate = items
        .slice(0, -1)
        .some(
          (it) =>
            it.product_id === newItem.product_id &&
            (it.quantity ?? null) === (newItem.quantity ?? null),
        );

      if (isDuplicate) {
        toast({
          title: "Duplicate item",
          description:
            "You added the same product with the same quantity. This is allowed but please review.",
        });
      }
    }
    lastItemCountRef.current = items.length;
    lastItemsRef.current = items;
  }, [items, toast]);

  useEffect(() => {
    if (items.length > previousItemsCountForFocusRef.current && items.length > 0) {
      const lastQuantityInput = quantityInputRefs.current[items.length - 1];
      if (lastQuantityInput) {
        requestAnimationFrame(() => {
          lastQuantityInput.focus();
          lastQuantityInput.select();
        });
      }
    }

    previousItemsCountForFocusRef.current = items.length;
  }, [items]);

  // Function to check if a pricing rule is applied for a product
  const getPricingRuleInfo = (productId: string, clientId: string) => {
    if (!clientId || !productId) return null;

    const pricingRule = pricingRuleByClientProduct.get(
      `${clientId}:${productId}`,
    );

    if (pricingRule) {
      const ruleValue = Number(pricingRule.price_rule_value);
      switch (pricingRule.price_rule_type) {
        case "discount_percentage":
          return `${ruleValue}% discount applied`;
        case "discount_flat":
          return `₹${ruleValue} discount applied`;
        case "multiplier":
          return `${ruleValue}x multiplier applied`;
        case "flat_addition":
          return `₹${ruleValue} addition applied`;
        case "conditional_discount": {
          const threshold = Number(pricingRule.conditional_threshold || 0);
          const below = Number(pricingRule.conditional_discount_below || 0);
          const aboveEqual = Number(
            pricingRule.conditional_discount_above_equal || 0,
          );

          return `Conditional discount: <₹${threshold.toFixed(0)} -₹${below.toFixed(0)}, ≥₹${threshold.toFixed(0)} -₹${aboveEqual.toFixed(0)}`;
        }
        case "category_based":
          return "Category-based pricing applied";
      }
    }
    return null;
  };

  // Function to calculate price based on client-specific pricing rules
  const calculateClientPrice = (
    productId: string,
    clientId: string,
  ): number => {
    const product = productsById.get(productId);
    if (!product) return 0;

    // Check if there's a client-specific pricing rule
    if (clientId) {
      const pricingRule = pricingRuleByClientProduct.get(
        `${clientId}:${productId}`,
      );

      if (pricingRule) {
        let basePrice = Number(product.paper_price || product.unit_price);

        if (pricingRule.fixed_base_value) {
          basePrice = Number(pricingRule.fixed_base_value);
        }

        if (basePrice > 0) {
          // Apply rule on top of base price
          const ruleValue = Number(pricingRule.price_rule_value || 0);
          let priced = basePrice;

          switch (pricingRule.price_rule_type) {
            case "discount_percentage":
              priced = basePrice * (1 - ruleValue / 100);
              break;
            case "discount_flat":
              priced = Math.max(0, basePrice - ruleValue);
              break;
            case "conditional_discount": {
              const threshold = Number(pricingRule.conditional_threshold || 0);
              const discountBelow = Number(
                pricingRule.conditional_discount_below || 0,
              );
              const discountAboveEqual = Number(
                pricingRule.conditional_discount_above_equal || 0,
              );

              const conditionalDiscount =
                basePrice >= threshold ? discountAboveEqual : discountBelow;
              priced = Math.max(0, basePrice - conditionalDiscount);
              break;
            }
            case "multiplier":
              priced = basePrice * ruleValue;
              break;
            case "flat_addition":
              priced = basePrice + ruleValue;
              break;
            default:
              priced = basePrice;
          }

          return Math.max(0, priced);
        }
      }
    }

    // No client-specific rule, use default unit_price
    return Math.max(0, Number(product.unit_price));
  };

  // Build a human-friendly breakdown of pricing steps (unit price only, per-bird applied to line total)
  const getPriceBreakdown = (
    productId: string,
    clientId: string,
  ) => {
    const product = productsById.get(productId);
    if (!product) return null;

    let basePrice = Number(product.paper_price || product.unit_price);
    let afterRule = basePrice;
    let ruleLabel: string | null = null;
    let ruleValueDisplay: string | null = null;

    const pricingRule = clientId
      ? pricingRuleByClientProduct.get(`${clientId}:${productId}`)
      : null;

    if (pricingRule) {
      let categoryPrice: number | null = 0;
      let categoryName = "Default";

      if (pricingRule.fixed_base_value) {
        categoryPrice = Number(pricingRule.fixed_base_value);
        categoryName = "Fixed Value";
        basePrice = categoryPrice;
      }

      if (basePrice > 0) {
        const ruleValue = Number(pricingRule.price_rule_value || 0);
        switch (pricingRule.price_rule_type) {
          case "discount_percentage":
            ruleLabel = "Discount %";
            ruleValueDisplay = `${ruleValue}%`;
            afterRule = basePrice * (1 - ruleValue / 100);
            break;
          case "discount_flat":
            ruleLabel = "Discount ₹";
            ruleValueDisplay = `₹${ruleValue.toFixed(2)}`;
            afterRule = Math.max(0, basePrice - ruleValue);
            break;
          case "multiplier":
            ruleLabel = "Multiplier";
            ruleValueDisplay = `${ruleValue}x`;
            afterRule = basePrice * ruleValue;
            break;
          case "flat_addition":
            ruleLabel = "Add ₹";
            ruleValueDisplay = `₹${ruleValue.toFixed(2)}`;
            afterRule = basePrice + ruleValue;
            break;
          case "conditional_discount":
            {
              const threshold = Number(pricingRule.conditional_threshold || 0);
              const discountBelow = Number(
                pricingRule.conditional_discount_below || 0,
              );
              const discountAboveEqual = Number(
                pricingRule.conditional_discount_above_equal || 0,
              );
              const selectedDiscount =
                basePrice >= threshold ? discountAboveEqual : discountBelow;

              ruleLabel = "Conditional Discount";
              ruleValueDisplay = `Base ₹${basePrice.toFixed(2)} ${basePrice >= threshold ? "≥" : "<"} ₹${threshold.toFixed(2)} → -₹${selectedDiscount.toFixed(2)}`;
              afterRule = Math.max(0, basePrice - selectedDiscount);
              break;
            }
          default:
            ruleLabel = "Category base";
            ruleValueDisplay = null;
            afterRule = basePrice;
        }

      }
    }
    const finalPrice = afterRule;

    return {
      basePrice,
      ruleLabel,
      ruleValueDisplay,
      afterRule,
      finalPrice,
    };
  };

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
    const isEndOfMonth = daysType === "end_of_month";

    if (isEndOfMonth) {
      // Calculate end of billed month
      const base = issueDate ? new Date(issueDate) : new Date();
      const extraMonths = Number.isFinite(days ?? null) ? Number(days ?? 0) : 0;

      // Move to the last day of the current month + extra months
      base.setMonth(base.getMonth() + extraMonths + 1, 0); // Set to day 0 of next month = last day of current month
      return base.toISOString().split("T")[0];
    } else {
      // Fixed days calculation
      return computeDueDate(issueDate, days);
    }
  };

  // Recalculate all item prices when client changes; leave selection untouched

  const handleClientChange = (clientId: string) => {
    const client = clientsById.get(clientId);
    const days = client?.due_days ?? 30;
    const daysType = client?.due_days_type ?? "fixed_days";
    const newDue = computeDueDateByType(formData.issue_date, daysType, days);
    const shouldAutoApplyGstDefault =
      !initialInvoice?.id || clientId !== initialInvoice.client_id;

    if (shouldAutoApplyGstDefault) {
      setSplitGst(shouldDefaultToSplitGst(client?.tax_id));
    }

    setSelectedDueDays(days);
    setSelectedDueDaysType(daysType);
    setFormData({ ...formData, client_id: clientId, due_date: newDue });

    setItems((prev) =>
      prev.map((item) => {
        if (!item.product_id) return item;
        const recalculated = calculateClientPrice(item.product_id, clientId);
        const updated = {
          ...item,
          unit_price: recalculated,
          bird_count: undefined,
          use_per_bird: false,
        };
        updated.line_total = calculateLineTotal(updated);
        return updated;
      }),
    );
  };

  const [totals, setTotals] = useState({
    subtotal: 0,
    tax_amount: 0,
    discount_amount: 0,
    round_off: 0,
    total_amount: 0,
  });

  // Calculate line total for each item
  // Order: Subtotal → Apply Discount → Calculate Tax on Discounted Amount → Add Tax
  const calculateLineTotal = (item: InvoiceItem) => {
    const qty = Number(item.quantity || 0);
    const unitPrice = Number(item.unit_price || 0);
    const taxRate = Number(item.tax_rate || 0);
    const discountRate = Number(item.discount || 0);

    const subtotal = qty * unitPrice;
    const discountAmount = (subtotal * discountRate) / 100;
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = (afterDiscount * taxRate) / 100;
    const afterTax = afterDiscount + taxAmount;

    return Math.max(0, afterTax);
  };

  // Recalculate totals whenever items or invoice-level rates change
  useEffect(() => {
    // Subtotal of line items (base, before per-bird)
    const baseSubtotal = items.reduce((sum, item) => sum + item.line_total, 0);

    // Invoice-level tax on base subtotal
    const invoice_tax_amount =
      (baseSubtotal * Number(invoiceRates.tax_percent || 0)) / 100;

    // Invoice-level discount on base subtotal
    const invoice_discount_amount =
      (baseSubtotal * Number(invoiceRates.discount_percent || 0)) / 100;

    // Calculate total line-item adjustments (taxes + discounts) for display
    const line_tax_amount = items.reduce((sum, item) => {
      const itemSubtotal =
        Number(item.quantity || 0) * Number(item.unit_price || 0);
      const discountAmount = (itemSubtotal * Number(item.discount || 0)) / 100;
      const afterDiscount = itemSubtotal - discountAmount;
      return sum + (afterDiscount * Number(item.tax_rate || 0)) / 100;
    }, 0);

    const line_discount_amount = items.reduce((sum, item) => {
      const itemSubtotal =
        Number(item.quantity || 0) * Number(item.unit_price || 0);
      return sum + (itemSubtotal * Number(item.discount || 0)) / 100;
    }, 0);

    // Round final total to nearest rupee and keep round-off delta for display.
    const unrounded_total =
      baseSubtotal +
      invoice_tax_amount -
      invoice_discount_amount;
    const total_amount = Math.round(unrounded_total);
    const round_off = total_amount - unrounded_total;
    const tax_amount = line_tax_amount + invoice_tax_amount;
    const discount_amount = line_discount_amount + invoice_discount_amount;

    setTotals({
      subtotal: baseSubtotal,
      tax_amount,
      discount_amount,
      round_off,
      total_amount,
    });
  }, [items, invoiceRates]);

  // No global per-bird toggle; per-item controls handle repricing

  const updateItemByIndex = (
    index: number,
    updater: (item: InvoiceItem) => InvoiceItem,
  ) => {
    setItems((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const updated = [...prev];
      const next = updater(updated[index]);
      next.line_total = calculateLineTotal(next);
      updated[index] = next;
      return updated;
    });
  };

  const handleProductToggle = (productId: string, enabled: boolean) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.product_id === productId,
      );

      if (enabled) {
        // Prevent enabling selection if no pricing rule exists for the selected client
        if (formData.client_id) {
          const hasRule = pricingRuleByClientProduct.has(
            `${formData.client_id}:${productId}`,
          );
          if (!hasRule) {
            return prev;
          }
        }
        const product = productsById.get(productId);
        if (!product) return prev;

        const existing = existingIndex >= 0 ? prev[existingIndex] : undefined;
        const unitPrice = calculateClientPrice(productId, formData.client_id);

        const baseItem: InvoiceItem = {
          product_id: productId,
          description: existing?.description || product.name,
          quantity: existing?.quantity ?? null,
          unit_price: unitPrice,
          tax_rate: 0,
          discount: 0,
          bird_count: null,
          enabled: true,
          use_per_bird: false,
          line_total: 0,
        };
        baseItem.line_total = calculateLineTotal(baseItem);

        // Append the new item; duplicate detection happens in useEffect
        return [...prev, baseItem];
      }

      // Remove the first matching item for this product
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated.splice(existingIndex, 1);
        return updated;
      }
      return prev;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
  };

  const parseNullableNumber = (val: string) =>
    val === "" ? null : Number(val);

  const handleQuantityChange = (index: number, value: string) => {
    updateItemByIndex(index, (item) => ({
      ...item,
      quantity: parseNullableNumber(value),
    }));
  };

  const handleUnitPriceChange = (index: number, value: string) => {
    updateItemByIndex(index, (item) => ({
      ...item,
      unit_price: parseNullableNumber(value),
    }));
  };

  const handleTaxChange = (index: number, value: string) => {
    updateItemByIndex(index, (item) => ({
      ...item,
      tax_rate: parseNullableNumber(value),
    }));
  };

  const handleDiscountChange = (index: number, value: string) => {
    updateItemByIndex(index, (item) => ({
      ...item,
      discount: parseNullableNumber(value),
    }));
  };

  const handleDescriptionChange = (index: number, value: string) => {
    updateItemByIndex(index, (item) => ({ ...item, description: value }));
  };

  const focusQuantityInput = (index: number) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const targetInput = quantityInputRefs.current[index];
        if (targetInput) {
          targetInput.focus();
          targetInput.select();
        }
      });
    });
  };

  const handleQuickAddProduct = (productId: string) => {
    const nextItemIndex = items.length;
    handleProductToggle(productId, true);
    setIsQuickAddOpen(false);
    setProductSearchValue("");
    focusQuantityInput(nextItemIndex);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const supabase = createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in");
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

      let invoiceId = initialInvoice?.id;

      if (!invoiceId) {
        let invoiceNumber: string;

        if (formData.invoice_number.trim()) {
          invoiceNumber = formData.invoice_number.trim();

          const { data: existing } = await supabase
            .from("invoices")
            .select("id")
            .eq("organization_id", profile.organization_id)
            .eq("invoice_number", invoiceNumber)
            .maybeSingle();

          if (existing) {
            setError(`Invoice number "${invoiceNumber}" already exists. Please use a different number.`);
            setIsLoading(false);
            return;
          }
        } else {
          const { data: generatedInvoiceNumber, error: generateNumberError } =
            await supabase.rpc("next_document_number", {
              p_doc_type: "invoice",
            });

          if (generateNumberError || !generatedInvoiceNumber) {
            throw generateNumberError || new Error("Failed to generate invoice number");
          }

          invoiceNumber = String(generatedInvoiceNumber);
        }

        // Generate reference number with REF. prefix
        const referenceNumber = `REF-${Date.now()}`;

        // Insert invoice (create mode)
        const { data: invoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert({
            invoice_number: invoiceNumber,
            reference_number: referenceNumber,
            client_id: formData.client_id,
            issue_date: formData.issue_date,
            due_date: formData.due_date,
            due_days_type: selectedDueDaysType || "fixed_days",
            status: "recorded",
            subtotal: totals.subtotal,
            tax_amount: totals.tax_amount,
            discount_amount: totals.discount_amount,
            total_amount: totals.total_amount,
            amount_paid: 0,
            total_birds: 0,
            notes: formData.notes,
            gst_percent: Number(invoiceRates.tax_percent || 0),
            split_gst: splitGst,
            created_by: user.id,
            organization_id: profile.organization_id,
          })
          .select()
          .single();

        if (invoiceError) throw invoiceError;
        invoiceId = invoice.id;
      } else {
        // Update invoice (edit mode)
        const { error: updateError } = await supabase
          .from("invoices")
          .update({
            client_id: formData.client_id,
            issue_date: formData.issue_date,
            due_date: formData.due_date,
            due_days_type: selectedDueDaysType || "fixed_days",
            subtotal: totals.subtotal,
            tax_amount: totals.tax_amount,
            discount_amount: totals.discount_amount,
            total_amount: totals.total_amount,
            total_birds: 0,
            notes: formData.notes,
            gst_percent: Number(invoiceRates.tax_percent || 0),
            split_gst: splitGst,
          })
          .eq("id", invoiceId);

        if (updateError) throw updateError;
        // Replace items: delete existing items and re-insert
        await supabase
          .from("invoice_items")
          .delete()
          .eq("invoice_id", invoiceId);
      }

      // Insert invoice items
      const itemsToInsert = items
        .filter(
          (item) =>
            item.product_id &&
            item.quantity !== null &&
            item.quantity !== 0 &&
            item.quantity > 0,
        )
        .map((item) => {
          // per-item bird data is no longer used; global adjustment will be calculated separately
          return {
            invoice_id: invoiceId,
            product_id: item.product_id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            discount: item.discount,
            line_total: item.line_total,
            bird_count: null,
            per_bird_adjustment: null,
          };
        });

      // Validate that at least one item with valid quantity exists
      if (itemsToInsert.length === 0) {
        setError(
          "Please add at least one product with a valid quantity (greater than 0)",
        );
        setIsLoading(false);
        return;
      }

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
          .from("invoice_items")
          .insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      if (!initialInvoice?.id && conversionQuotationId && invoiceId) {
        const { error: conversionUpdateError } = await supabase
          .from("quotations")
          .update({
            status: "converted",
            converted_invoice_id: invoiceId,
            converted_at: new Date().toISOString(),
          })
          .eq("id", conversionQuotationId)
          .is("converted_invoice_id", null);

        if (conversionUpdateError) throw conversionUpdateError;
      }

      router.push(`/dashboard/invoices/${invoiceId}`);
      router.refresh();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedClient = useMemo(
    () => clientsById.get(formData.client_id),
    [clientsById, formData.client_id],
  );

  const filteredClients = useMemo(() => {
    const query = clientSearchValue.toLowerCase();
    return clients.filter((client) =>
      client.name.toLowerCase().includes(query),
    );
  }, [clients, clientSearchValue]);

  const availableProducts = useMemo(
    () =>
      products.filter((p) =>
        pricingRuleByClientProduct.has(`${formData.client_id}:${p.id}`),
      ),
    [products, pricingRuleByClientProduct, formData.client_id],
  );

  const filteredProducts = useMemo(() => {
    const query = productSearchValue.toLowerCase();
    return availableProducts.filter((product) =>
      product.name.toLowerCase().includes(query),
    );
  }, [availableProducts, productSearchValue]);

  const duplicateItemIndexes = useMemo(() => {
    const groups = new Map<string, number[]>();
    items.forEach((item, index) => {
      const key = `${item.product_id ?? ""}:${item.quantity ?? ""}`;
      const bucket = groups.get(key);
      if (bucket) {
        bucket.push(index);
      } else {
        groups.set(key, [index]);
      }
    });

    const duplicates = new Set<number>();
    for (const indices of groups.values()) {
      if (indices.length > 1) {
        for (const index of indices) {
          duplicates.add(index);
        }
      }
    }
    return duplicates;
  }, [items]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client_id">
                Client <span className="text-red-500">*</span>
              </Label>
              <Popover
                open={isClientDropdownOpen}
                onOpenChange={(open) => {
                  setIsClientDropdownOpen(open);
                  if (!open) {
                    setClientSearchValue("");
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={isClientDropdownOpen}
                    id="client_id"
                    className="w-full justify-between font-normal"
                    disabled={!!initialInvoice?.id}
                  >
                    {selectedClient ? selectedClient.name : "Select a client"}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Type client name..."
                      value={clientSearchValue}
                      onValueChange={setClientSearchValue}
                    />
                    <CommandList>
                      <CommandEmpty>No client found.</CommandEmpty>
                      {filteredClients.map((client) => (
                        <CommandItem
                          key={client.id}
                          value={client.name}
                          onSelect={() => {
                            handleClientChange(client.id);
                            setIsClientDropdownOpen(false);
                            setClientSearchValue("");
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${formData.client_id === client.id ? "opacity-100" : "opacity-0"}`}
                          />
                          {client.name}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice_number">
                Invoice Number <span className="text-red-500">*</span>
              </Label>
              <Input
                id="invoice_number"
                value={formData.invoice_number}
                onChange={(e) => {
                  const sanitizedValue = sanitizeInvoiceNumberInput(
                    e.target.value,
                  );
                  setFormData({ ...formData, invoice_number: sanitizedValue });
                }}
                placeholder={
                  initialInvoice?.id ? "Invoice number" : "Leave blank to auto-generate"
                }
                disabled={!!initialInvoice?.id}
                pattern="[A-Za-z0-9-]+"
              />
              <p className="text-xs text-muted-foreground">
                {initialInvoice?.id
                  ? "Invoice number cannot be changed"
                  : "Enter a custom number or leave blank to auto-generate."}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="issue_date">
                Issue Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="issue_date"
                type="date"
                required
                placeholder="Select issue date"
                value={formData.issue_date}
                onChange={(e) => {
                  const nextIssue = e.target.value;
                  const days = selectedDueDays ?? 30;
                  const daysType = selectedDueDaysType ?? "fixed_days";
                  setFormData({
                    ...formData,
                    issue_date: nextIssue,
                    due_date: computeDueDateByType(nextIssue, daysType, days),
                  });
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_date">
                Due Date <span className="text-red-500">*</span>
              </Label>
              {selectedDueDaysType === "end_of_month" ? (
                <div className="flex items-center justify-center w-full px-3 py-2 rounded-md bg-blue-50 border border-blue-200 h-10">
                  <span className="text-lg font-semibold text-blue-700">
                    End of the billed month
                  </span>
                </div>
              ) : (
                <Input
                  id="due_date"
                  type="date"
                  required
                  placeholder="Select due date"
                  value={formData.due_date}
                  disabled
                />
              )}
              <p className="text-xs text-muted-foreground">
                Due date is auto-calculated from client due settings and issue
                date.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Line Items</CardTitle>
          <p className="text-sm text-muted-foreground">
            Add products to this invoice.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing Line Items */}
          <div className="space-y-4">
            {items.length === 0 && formData.client_id && (
              <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg bg-slate-50">
                No products added yet. Use the dropdown below to add products.
              </div>
            )}
            {items.map((item, index) => {
              if (!item.product_id) return null;
              const product = productsById.get(item.product_id);
              if (!product) return null;

              const enabled = true;
              // per-item per-bird logic removed; preview is just based on current pricing rules
              const previewPrice = calculateClientPrice(
                product.id,
                formData.client_id,
              );
              const ruleInfo = formData.client_id
                ? getPricingRuleInfo(product.id, formData.client_id)
                : null;
              const showMissingRuleWarning = formData.client_id && !ruleInfo;
              const breakdown = formData.client_id
                ? getPriceBreakdown(product.id, formData.client_id)
                : null;

              return (
                <div
                  key={`item-${index}`}
                  className={`space-y-3 rounded-lg border p-4 ${duplicateItemIndexes.has(index) ? "border-red-500 border-2" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveItem(index)}
                      className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{product.name}</p>
                            {ruleInfo && (
                              <Badge className="text-xs px-2 py-0.5 border rounded bg-green-100 text-green-800 border-green-200">
                                {ruleInfo}
                              </Badge>
                            )}
                            {showMissingRuleWarning && (
                              <Badge className="text-xs px-2 py-0.5 border rounded bg-red-100 text-red-800 border-red-200">
                                Set pricing rule first
                              </Badge>
                            )}
                          </div>
                          {product.description && (
                            <p className="text-xs text-muted-foreground">
                              {product.description}
                            </p>
                          )}
                        </div>
                        <div className="text-sm font-medium">
                          ₹{formatUnitPrice(previewPrice)}
                        </div>
                      </div>

                      {breakdown && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          <div>
                            <span className="font-medium">Base:</span> ₹
                            {formatUnitPrice(breakdown.basePrice)}
                          </div>
                          {breakdown.ruleLabel && (
                            <div>
                              <span className="font-medium">
                                {breakdown.ruleLabel}:
                              </span>{" "}
                              {breakdown.ruleValueDisplay
                                ? breakdown.ruleValueDisplay
                                : "Applied"}{" "}
                              → ₹{formatUnitPrice(breakdown.afterRule)}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Unit Price:</span> ₹
                            {formatUnitPrice(breakdown.finalPrice)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {enabled && item && (
                    <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-4">
                      <div className="space-y-2 md:col-span-2">
                        <Label>Description</Label>
                        <Input
                          required
                          disabled
                          value={item.description}
                          onChange={(e) =>
                            handleDescriptionChange(index, e.target.value)
                          }
                          placeholder="Item description"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Quantity</Label>
                        <Input
                          ref={(el) => {
                            quantityInputRefs.current[index] = el;
                          }}
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          placeholder="e.g., 10"
                          value={item.quantity ?? ""}
                          onChange={(e) =>
                            handleQuantityChange(index, e.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Unit Price</Label>
                        <Input
                          type="number"
                          step="0.00000001"
                          min="0"
                          placeholder="e.g., 250.00"
                          disabled
                          value={
                            item.unit_price !== null &&
                            item.unit_price !== undefined
                              ? item.unit_price
                              : ""
                          }
                          onChange={(e) =>
                            handleUnitPriceChange(index, e.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Line Total</Label>
                        <Input
                          value={`₹${item.line_total.toFixed(2)}`}
                          disabled
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Add Product Dropdown */}
          {formData.client_id && (
            <div className="space-y-2 pb-4 border-b">
              <Label htmlFor="add-product">Add Product</Label>
              <Popover
                open={isQuickAddOpen}
                onOpenChange={(open) => {
                  setIsQuickAddOpen(open);
                  if (!open) {
                    setProductSearchValue("");
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    id="add-product"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={isQuickAddOpen}
                    className="w-full justify-between font-normal"
                  >
                    Select a product to add...
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Type product name..."
                      value={productSearchValue}
                      onValueChange={setProductSearchValue}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {availableProducts.length === 0
                          ? "No products available with pricing rules"
                          : "No product found."}
                      </CommandEmpty>
                      {filteredProducts.map((product) => (
                        <CommandItem
                          key={product.id}
                          value={product.name}
                          onSelect={() => handleQuickAddProduct(product.id)}
                        >
                          {product.name}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                {items.length === 0
                  ? "Select products to add to this invoice"
                  : `${items.length} product(s) added`}
              </p>
            </div>
          )}

          {!formData.client_id && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              Please select a client first to add products.
            </div>
          )}

          {/* IGST Configuration */}
          <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">IGST Configuration</p>
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="space-y-2 flex-1">
                <Label htmlFor="gst-percent" className="text-sm">IGST (%)</Label>
                <Input
                  id="gst-percent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="e.g., 18"
                  value={invoiceRates.tax_percent ?? ""}
                  onChange={(e) =>
                    setInvoiceRates((r) => ({
                      ...r,
                      tax_percent:
                        e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="flex items-center gap-3 pb-2">
                <Switch
                  id="split-gst"
                  checked={splitGst}
                  onCheckedChange={setSplitGst}
                />
                <Label htmlFor="split-gst" className="text-sm cursor-pointer">
                  Split as CGST + SGST
                </Label>
              </div>
            </div>
            {splitGst && (invoiceRates.tax_percent || 0) > 0 && (
              <p className="text-xs text-slate-500">
                CGST {((invoiceRates.tax_percent || 0) / 2).toFixed(2)}% +
                SGST {((invoiceRates.tax_percent || 0) / 2).toFixed(2)}%
              </p>
            )}
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal:</span>
              <span className="font-medium">₹{totals.subtotal.toFixed(2)}</span>
            </div>

            {Number(totals.tax_amount) > 0 && (
              splitGst ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      CGST ({((invoiceRates.tax_percent || 0) / 2).toFixed(2)}%):
                    </span>
                    <span className="font-medium">₹{(totals.tax_amount / 2).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      SGST ({((invoiceRates.tax_percent || 0) / 2).toFixed(2)}%):
                    </span>
                    <span className="font-medium">₹{(totals.tax_amount / 2).toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    IGST{(invoiceRates.tax_percent || 0) > 0 ? ` (${invoiceRates.tax_percent}%)` : ""}:
                  </span>
                  <span className="font-medium">₹{totals.tax_amount.toFixed(2)}</span>
                </div>
              )
            )}

            {Number(totals.discount_amount) > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount:</span>
                <span>-₹{totals.discount_amount.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Round Off:</span>
              <span className="font-medium">
                {totals.round_off >= 0 ? "+" : "-"}₹{Math.abs(totals.round_off).toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Total:</span>
              <span>₹{totals.total_amount.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="grid gap-3 sm:gap-4 grid-cols-1">
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Additional notes for this invoice..."
                rows={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
          {error}
        </div>
      )}

      <div className="flex gap-4">
        <Button
          type="submit"
          disabled={
            isLoading ||
            !formData.client_id
          }
        >
          {isLoading ? "Creating..." : "Create Invoice"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
