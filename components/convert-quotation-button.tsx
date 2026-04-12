"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";

interface ConvertQuotationButtonProps {
  quotationId: string;
  disabled?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
}

export function ConvertQuotationButton({ quotationId, disabled, size = "default" }: ConvertQuotationButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isConverting, setIsConverting] = useState(false);

  const handleConvert = async () => {
    setIsConverting(true);
    try {
      router.push(`/dashboard/invoices/new?fromQuotation=${quotationId}`);
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Unable to open invoice creation",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <Button onClick={handleConvert} disabled={disabled || isConverting} size={size}>
      {isConverting ? <Spinner className="h-4 w-4 mr-2" /> : null}
      {isConverting ? "Opening..." : "Convert to Invoice"}
    </Button>
  );
}
