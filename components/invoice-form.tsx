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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { getPriceForCategoryOnDate } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
  email: string;
  due_days?: number | null;
  due_days_type?: string | null;
  enable_per_bird?: boolean | null;
  value_per_bird?: number | null;
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
  priceCategories?: Array<{ id: string; name: string }>;
  priceHistory?: Array<{
    price_category_id: string;
    price: number;
    effective_date: string;
  }>;
  initialInvoice?: {
    id: string;
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

export function InvoiceForm({
  clients,
  products,
  clientPricingRules,
  priceCategories = [],
  priceHistory = [],
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

    // Subtotal with taxes
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
      tax_percent: Number.isFinite(tax_percent) ? tax_percent : 0,
    };
  };

  const [invoiceRates, setInvoiceRates] = useState<{
    discount_percent: number | null;
    tax_percent: number | null;
  }>(deriveInvoiceRatesFromInitial);

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
    invoice_number: initialInvoice?.invoice_number || "",
    issue_date: initialInvoice?.issue_date || today,
    due_date: initialInvoice?.due_date || defaultDue,
    due_days_type:
      initialInvoice?.due_days_type || selectedDueDaysType || "fixed_days",
    notes: initialInvoice?.notes || "",
  });

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

  const getClientAdjustment = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    return client?.value_per_bird ? Number(client.value_per_bird) : 0;
  };
  // Function to check if a pricing rule is applied for a product
  const getPricingRuleInfo = (productId: string, clientId: string) => {
    if (!clientId || !productId) return null;

    const pricingRule = clientPricingRules.find(
      (rule) => rule.product_id === productId && rule.client_id === clientId,
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

  // Check if item at given index is an exact duplicate (same product and same quantity) with any other item
  const isExactDuplicate = (index: number) => {
    if (index < 0 || index >= items.length) return false;
    const item = items[index];
    return items.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.product_id === item.product_id &&
        (other.quantity ?? null) === (item.quantity ?? null),
    );
  };

  // Function to calculate price based on client-specific pricing rules
  const calculateClientPrice = (
    productId: string,
    clientId: string,
    issueDate?: string,
    applyPerBird: boolean = false,
    birdCount: number = 1,
  ): number => {
    const product = products.find((p) => p.id === productId);
    if (!product) return 0;

    // Check if there's a client-specific pricing rule
    if (clientId) {
      const pricingRule = clientPricingRules.find(
        (rule) => rule.product_id === productId && rule.client_id === clientId,
      );

      if (pricingRule) {
        let basePrice = 0;

        // Check if using fixed value
        if (pricingRule.fixed_base_value) {
          basePrice = Number(pricingRule.fixed_base_value);
        } else if (pricingRule.price_category_id) {
          // Get category price as base
          const effectiveDate = issueDate || formData.issue_date;
          const categoryPrice = getPriceForCategoryOnDate(
            pricingRule.price_category_id,
            effectiveDate,
            priceHistory,
          );
          basePrice =
            categoryPrice !== null
              ? categoryPrice
              : Number(product.paper_price);
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

          // Eggs category pricing is entered per 100; for egg products, unit price is per egg
          const selectedCategory = priceCategories.find(
            (c) => c.id === pricingRule.price_category_id,
          );
          const isEggCategory = selectedCategory
            ? /egg/i.test(selectedCategory.name)
            : false;
          const isEggProduct = /egg/i.test(product.name);
          const adjusted =
            isEggCategory && isEggProduct ? priced / 100 : priced;

          return Math.max(0, adjusted);
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
    issueDate?: string,
    applyPerBird: boolean = false,
    birdCount: number = 1,
  ) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return null;

    const clientAdjustment = getClientAdjustment(clientId);
    const perBirdValue = clientAdjustment;
    const safeBirds = Math.max(1, birdCount);

    let basePrice = Number(product.unit_price);
    let afterRule = basePrice;
    let ruleLabel: string | null = null;
    let ruleValueDisplay: string | null = null;

    const pricingRule = clientId
      ? clientPricingRules.find(
          (rule) =>
            rule.product_id === productId && rule.client_id === clientId,
        )
      : null;

    if (pricingRule) {
      let categoryPrice: number | null = 0;
      let categoryName = "Default";

      if (pricingRule.fixed_base_value) {
        categoryPrice = Number(pricingRule.fixed_base_value);
        categoryName = "Fixed Value";
        basePrice = categoryPrice;
      } else if (pricingRule.price_category_id) {
        const effectiveDate = issueDate || formData.issue_date;
        categoryPrice = getPriceForCategoryOnDate(
          pricingRule.price_category_id,
          effectiveDate,
          priceHistory,
        );
        basePrice =
          categoryPrice !== null ? categoryPrice : Number(product.paper_price);
        const selectedCategory = priceCategories.find(
          (c) => c.id === pricingRule.price_category_id,
        );
        categoryName = selectedCategory?.name || "N/A";
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

        // For Eggs category, price is per 100; show unit price after dividing by 100 for egg products
        const selectedCategory = priceCategories.find(
          (c) => c.id === pricingRule.price_category_id,
        );
        const isEggCategory = selectedCategory
          ? /egg/i.test(selectedCategory.name)
          : false;
        const isEggProduct = /egg/i.test(product.name);
        if (isEggCategory && isEggProduct) {
          // Keep basePrice as category price (per 100) but unit price should reflect per-egg
          afterRule = afterRule / 100;
        }
      }
    }

    // Per-bird adjustment is now applied to line total, not unit price
    const birdAdj = applyPerBird ? perBirdValue * safeBirds : 0;
    const finalPrice = afterRule;

    return {
      basePrice,
      ruleLabel,
      ruleValueDisplay,
      afterRule,
      perBirdValue,
      birdCount: applyPerBird ? safeBirds : 0,
      birdAdj,
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
  const [clientPerBirdEnabled, setClientPerBirdEnabled] = useState(false);
  const [clientPerBirdValue, setClientPerBirdValue] = useState(0);

  const handleClientChange = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    const days = client?.due_days ?? 30;
    const daysType = client?.due_days_type ?? "fixed_days";
    const newDue = computeDueDateByType(formData.issue_date, daysType, days);
    setSelectedDueDays(days);
    setSelectedDueDaysType(daysType);
    setFormData({ ...formData, client_id: clientId, due_date: newDue });

    // track per-bird settings from client
    setClientPerBirdEnabled(!!client?.enable_per_bird);
    setClientPerBirdValue(Number(client?.value_per_bird || 0));

    setItems((prev) =>
      prev.map((item) => {
        if (!item.product_id) return item;
        // per-item per-bird no longer used; always false
        const recalculated = calculateClientPrice(
          item.product_id,
          clientId,
          formData.issue_date,
          false,
          1,
        );
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
    total_amount: 0,
    per_bird_amount: 0,
    total_birds: 0,
  });

  // Manual total birds input (user-provided, not derived from item quantities)
  const [globalBirdCount, setGlobalBirdCount] = useState<number>(
    initialInvoice?.total_birds || 0,
  );

  // sync bird count if editing an existing invoice
  useEffect(() => {
    if (initialInvoice && initialInvoice.total_birds != null) {
      setGlobalBirdCount(initialInvoice.total_birds);
    }
  }, [initialInvoice]);

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

  // Recalculate totals whenever items or invoice-level rates or client per-bird change
  // Order: Sum line totals (base) → apply invoice tax/discount → add per-bird adjustment
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

    // total number of birds: use manual user input rather than quantity sum
    const totalBirds = Number(globalBirdCount || 0);

    const perBirdAmount =
      clientPerBirdEnabled && clientPerBirdValue !== 0
        ? clientPerBirdValue * totalBirds
        : 0;

    // Total amount including per-bird adjustment at the end
    const total_amount =
      baseSubtotal +
      invoice_tax_amount -
      invoice_discount_amount +
      perBirdAmount;
    const tax_amount = line_tax_amount + invoice_tax_amount;
    const discount_amount = line_discount_amount + invoice_discount_amount;

    setTotals({
      subtotal: baseSubtotal,
      tax_amount,
      discount_amount,
      total_amount,
      per_bird_amount: perBirdAmount,
      total_birds: totalBirds,
    });
  }, [
    items,
    invoiceRates,
    clientPerBirdEnabled,
    clientPerBirdValue,
    globalBirdCount,
  ]);

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
          const hasRule = clientPricingRules.some(
            (rule) =>
              rule.product_id === productId &&
              rule.client_id === formData.client_id,
          );
          if (!hasRule) {
            return prev;
          }
        }
        const product = products.find((p) => p.id === productId);
        if (!product) return prev;

        const existing = existingIndex >= 0 ? prev[existingIndex] : undefined;
        // Enable per-bird by default for Live category Whole bird products
        const applyPerBird = false; // global per-bird will be handled separately
        // For unit price, do not depend on bird count; leave bird_count blank until user enters
        const unitPrice = calculateClientPrice(
          productId,
          formData.client_id,
          formData.issue_date,
          false,
          1,
        );

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
      // Validate per-bird requirement: if per-bird is enabled, bird count must be provided
      if (clientPerBirdEnabled && globalBirdCount <= 0) {
        setError(
          "Total birds is required when per-bird pricing is enabled. Please enter a bird count greater than 0."
        );
        setIsLoading(false);
        return;
      }

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
        // Use manual invoice number from form
        const invoiceNumber = formData.invoice_number;
        // Generate reference number with REF. prefix
        const referenceNumber = `REF-${Date.now()}`;

        // Check for duplicate invoice number
        const { data: existingInvoice } = await supabase
          .from("invoices")
          .select("id")
          .eq("invoice_number", invoiceNumber)
          .maybeSingle();

        if (existingInvoice) {
          setError(
            `Invoice number "${invoiceNumber}" already exists. Please use a different invoice number.`,
          );
          setIsLoading(false);
          return;
        }

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
            total_birds: globalBirdCount,
            notes: formData.notes,
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
            total_birds: globalBirdCount,
            notes: formData.notes,
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

      router.push(`/dashboard/invoices/${invoiceId}`);
      router.refresh();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedClient = clients.find((c) => c.id === formData.client_id);

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
              <Select
                value={formData.client_id}
                onValueChange={(value) => handleClientChange(value)}
                disabled={!!initialInvoice?.id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedClient && (
                <div className="mt-1">
                  {selectedClient.enable_per_bird ? (
                    <p className="text-sm text-amber-600">
                      Per‑bird enabled: ₹
                      {Number(selectedClient.value_per_bird || 0).toFixed(2)} /
                      bird
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Per‑bird disabled for this client
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice_number">
                Invoice Number <span className="text-red-500">*</span>
              </Label>
              <Input
                id="invoice_number"
                required
                value={formData.invoice_number}
                onChange={(e) =>
                  setFormData({ ...formData, invoice_number: e.target.value })
                }
                placeholder="e.g., INV-001, INV-002"
                disabled={!!initialInvoice?.id}
              />
              <p className="text-xs text-muted-foreground">
                {initialInvoice?.id
                  ? "Invoice number cannot be changed"
                  : "Enter a unique invoice number"}
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
                  onChange={(e) =>
                    setFormData({ ...formData, due_date: e.target.value })
                  }
                />
              )}
              {selectedDueDaysType === "end_of_month" && (
                <p className="text-xs text-blue-600">
                  Auto-calculated as the end of the month based on issue date
                </p>
              )}
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
              const product = products.find((p) => p.id === item.product_id);
              if (!product) return null;

              const enabled = true;
              // per-item per-bird logic removed; preview is just based on current pricing rules
              const previewPrice = calculateClientPrice(
                product.id,
                formData.client_id,
                formData.issue_date,
                false,
                1,
              );
              const ruleInfo = formData.client_id
                ? getPricingRuleInfo(product.id, formData.client_id)
                : null;
              const showMissingRuleWarning = formData.client_id && !ruleInfo;
              const clientAdj = formData.client_id
                ? getClientAdjustment(formData.client_id)
                : 0;
              const breakdown = formData.client_id
                ? getPriceBreakdown(
                    product.id,
                    formData.client_id,
                    formData.issue_date,
                    false,
                    1,
                  )
                : null;

              return (
                <div
                  key={`item-${index}`}
                  className={`space-y-3 rounded-lg border p-4 ${isExactDuplicate(index) ? "border-red-500 border-2" : ""}`}
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
                          ₹{previewPrice.toFixed(2)}
                        </div>
                      </div>

                      {breakdown && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          <div>
                            <span className="font-medium">Base:</span> ₹
                            {breakdown.basePrice.toFixed(2)}
                          </div>
                          {breakdown.ruleLabel && (
                            <div>
                              <span className="font-medium">
                                {breakdown.ruleLabel}:
                              </span>{" "}
                              {breakdown.ruleValueDisplay
                                ? breakdown.ruleValueDisplay
                                : "Applied"}{" "}
                              → ₹{breakdown.afterRule.toFixed(2)}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Unit Price:</span> ₹
                            {breakdown.finalPrice.toFixed(2)}
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
                          step="0.01"
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
              <Select
                value=""
                onValueChange={(productId) => {
                  if (productId) {
                    handleProductToggle(productId, true);
                  }
                }}
              >
                <SelectTrigger id="add-product">
                  <SelectValue placeholder="Select a product to add..." />
                </SelectTrigger>
                <SelectContent>
                  {products
                    .filter((p) => {
                      // Show only products with pricing rules for this client
                      const hasRule = clientPricingRules.some(
                        (rule) =>
                          rule.product_id === p.id &&
                          rule.client_id === formData.client_id,
                      );
                      return hasRule;
                    })
                    .map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  {products.filter((p) =>
                    clientPricingRules.some(
                      (rule) =>
                        rule.product_id === p.id &&
                        rule.client_id === formData.client_id,
                    ),
                  ).length === 0 && (
                    <SelectItem value="_no_products" disabled>
                      No products available with pricing rules
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
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

          {/*
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm">Invoice Discount (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={invoiceRates.discount_percent ?? ""}
                onChange={(e) =>
                  setInvoiceRates((r) => ({
                    ...r,
                    discount_percent:
                      e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Invoice Tax (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
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
          </div>
          */}

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal:</span>
              <span className="font-medium">₹{totals.subtotal.toFixed(2)}</span>
            </div>

            {/* <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax:</span>
              <span className="font-medium">₹{totals.tax_amount.toFixed(2)}</span>
            </div> */}

            {Number(totals.discount_amount) > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount:</span>
                <span>-₹{totals.discount_amount.toFixed(2)}</span>
              </div>
            )}

            {clientPerBirdEnabled && (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label className="text-sm">
                    Total birds <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={globalBirdCount || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setGlobalBirdCount(0);
                      } else {
                        setGlobalBirdCount(Math.max(0, Number(val)));
                      }
                    }}
                    placeholder="Enter number of birds"
                    className={`w-36 ${globalBirdCount <= 0 ? "border-red-300" : ""}`}
                  />
                </div>
              </div>
            )}

            {clientPerBirdEnabled && totals.total_birds > 0 && (
              <div className="flex justify-between text-sm text-amber-600">
                <span>
                  Per-bird adjustment ({totals.total_birds} birds × ₹
                  {clientPerBirdValue.toFixed(2)}/bird)
                </span>
                <span>₹{totals.per_bird_amount.toFixed(2)}</span>
              </div>
            )}

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
            !formData.client_id ||
            !formData.invoice_number ||
            (clientPerBirdEnabled && globalBirdCount <= 0)
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
