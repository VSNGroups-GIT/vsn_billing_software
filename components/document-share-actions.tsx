"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Mail, MessageCircle } from "lucide-react";

interface DocumentShareActionsProps {
  documentType: "invoice" | "quotation";
  documentId: string;
}

export function DocumentShareActions({ documentType, documentId }: DocumentShareActionsProps) {
  const { toast } = useToast();
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSendingWhatsapp, setIsSendingWhatsapp] = useState(false);
  const [hasSentEmail, setHasSentEmail] = useState(false);
  const [hasSentWhatsapp, setHasSentWhatsapp] = useState(false);

  useEffect(() => {
    const emailKey = `document-share:${documentType}:${documentId}:email`;
    const whatsappKey = `document-share:${documentType}:${documentId}:whatsapp`;
    setHasSentEmail(window.localStorage.getItem(emailKey) === "sent");
    setHasSentWhatsapp(window.localStorage.getItem(whatsappKey) === "sent");
  }, [documentId, documentType]);

  const sendDocument = async (channel: "email" | "whatsapp") => {
    if (channel === "email") {
      setIsSendingEmail(true);
    } else {
      setIsSendingWhatsapp(true);
    }

    try {
      const response = await fetch("/api/documents/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType, documentId, channel }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `Failed to send ${channel}`);
      }

      const storageKey = `document-share:${documentType}:${documentId}:${channel}`;
      window.localStorage.setItem(storageKey, "sent");

      if (channel === "email") {
        setHasSentEmail(true);
      } else {
        setHasSentWhatsapp(true);
      }

      toast({
        variant: "success",
        title: `${channel === "email" ? "Email" : "WhatsApp"} sent`,
        description: result.message || `The ${documentType} was sent successfully.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to send ${channel}`;
      toast({
        variant: "destructive",
        title: `Send ${channel === "email" ? "Email" : "WhatsApp"} failed`,
        description: message,
      });
    } finally {
      if (channel === "email") {
        setIsSendingEmail(false);
      } else {
        setIsSendingWhatsapp(false);
      }
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => sendDocument("email")}
        disabled={isSendingEmail || isSendingWhatsapp}
      >
        <Mail className="h-4 w-4 mr-1" />
        {isSendingEmail ? "Sending..." : hasSentEmail ? "Resend Email" : "Send Email"}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => sendDocument("whatsapp")}
        disabled={isSendingEmail || isSendingWhatsapp}
      >
        <MessageCircle className="h-4 w-4 mr-1" />
        {isSendingWhatsapp ? "Sending..." : hasSentWhatsapp ? "Resend WhatsApp" : "Send WhatsApp"}
      </Button>
    </div>
  );
}
