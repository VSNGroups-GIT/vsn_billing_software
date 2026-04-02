"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";

interface ConvertQuotationButtonProps {
  quotationId: string;
  disabled?: boolean;
}

export function ConvertQuotationButton({ quotationId, disabled }: ConvertQuotationButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isConverting, setIsConverting] = useState(false);

  const handleConvert = async () => {
    setIsConverting(true);
    try {
      const res = await fetch("/api/quotations/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotationId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to convert quotation");
      }

      toast({ variant: "success", title: "Converted", description: "Quotation converted to invoice" });
      router.push(`/dashboard/invoices/${data.invoiceId}`);
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Conversion failed",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <Button onClick={handleConvert} disabled={disabled || isConverting}>
      {isConverting ? <Spinner className="h-4 w-4 mr-2" /> : null}
      {isConverting ? "Converting..." : "Convert to Invoice"}
    </Button>
  );
}
