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
import { sendClientInvitation } from "@/app/actions/send-client-invitation";

interface Client {
  id: string;
  name: string;
  email: string;
  tax_id?: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  notes: string | null;
  due_days?: number | null;
  due_days_type?: string | null;
}

interface ClientFormProps {
  client?: Client;
}

export function ClientForm({ client }: ClientFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [fetchingPincode, setFetchingPincode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: client?.name || "",
    email: client?.email || "",
    tax_id: client?.tax_id || "",
    phone: client?.phone || "",
    address: client?.address || "",
    city: client?.city || "",
    state: client?.state || "",
    zip_code: client?.zip_code || "",
    country: client?.country || "India",
    notes: client?.notes || "",
    due_days: client?.due_days?.toString() || "30",
    due_days_type: client?.due_days_type || "fixed_days",
  });

  const handlePincodeChange = async (pincode: string) => {
    const digitsOnly = pincode.replace(/\D/g, "").slice(0, 6);
    setFormData({ ...formData, zip_code: digitsOnly });

    // Only fetch if pincode is 6 digits (Indian pincode format)
    if (digitsOnly.length === 6 && /^\d{6}$/.test(digitsOnly)) {
      setFetchingPincode(true);
      try {
        const response = await fetch(
          `https://api.postalpincode.in/pincode/${digitsOnly}`,
        );
        const data = await response.json();

        if (data[0]?.Status === "Success" && data[0]?.PostOffice?.length > 0) {
          const postOffice = data[0].PostOffice[0];
          setFormData((prev) => ({
            ...prev,
            city: postOffice.District || prev.city,
            state: postOffice.State || prev.state,
            country: "India",
          }));
        }
      } catch (err) {
        // Silently fail pincode lookup
      } finally {
        setFetchingPincode(false);
      }
    }
  };

  const countries = [
    "India",
    "USA",
    "United Kingdom",
    "Canada",
    "Australia",
    "Singapore",
    "UAE",
    "Other",
  ];
  const dueTypeOptions = [
    { value: "fixed_days", label: "Fixed Number of Days" },
    { value: "end_of_month", label: "End of the billed month" },
  ];
  const countryOptions = countries.map((country) => ({
    value: country,
    label: country,
  }));

  const handlePhoneChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 10);
    setFormData((prev) => ({ ...prev, phone: digitsOnly }));
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
      toast({
        variant: "destructive",
        title: "Authentication required",
        description: "You must be logged in to perform this action.",
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

      // Validate phone is provided and has correct length
      if (!formData.phone || formData.phone.trim().length === 0) {
        toast({
          variant: "destructive",
          title: "Missing phone number",
          description: "Please enter a valid phone number.",
        });
        setIsLoading(false);
        return;
      }

      if (formData.phone.length < 10) {
        toast({
          variant: "destructive",
          title: "Invalid phone number",
          description: "Phone number must be at least 10 digits.",
        });
        setIsLoading(false);
        return;
      }

      const dueDays = Number(formData.due_days) || 0;

      if (client) {
        // Update existing client
        const { error } = await supabase
          .from("clients")
          .update({
            ...formData,
            due_days: dueDays,
          })
          .eq("id", client.id);

        if (error) throw error;

        toast({
          variant: "success",
          title: "Client updated",
          description: "Client information has been updated successfully.",
        });
      } else {
        // Create new client
        const { error } = await supabase.from("clients").insert({
          ...formData,
          due_days: dueDays,
          created_by: user.id,
          organization_id: profile.organization_id,
        });

        if (error) throw error;

        // Send invitation email to new client (non-critical)
        await sendClientInvitation(formData.email, formData.name);

        toast({
          variant: "success",
          title: "Client created",
          description: `${formData.name} has been added successfully.`,
        });
      }

      await router.push("/dashboard/clients");
    } catch (error: unknown) {
      let errorMessage = "An unexpected error occurred. Please try again.";

      if (error instanceof Error) {
        if (
          error.message.includes("duplicate") ||
          error.message.includes("unique")
        ) {
          errorMessage =
            "A client with this email already exists in your organization.";
        } else if (error.message.includes("organization")) {
          errorMessage = "Organization error: Please contact support.";
        } else {
          errorMessage = error.message;
        }
      }

      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">
                Client Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="ABC Corporation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="contact@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">
                Phone <span className="text-red-500">*</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                value={formData.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="00000 00000"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax_id">GST / Tax ID</Label>
              <Input
                id="tax_id"
                value={formData.tax_id}
                onChange={(e) =>
                  setFormData({ ...formData, tax_id: e.target.value })
                }
                placeholder="27ABCDE1234F1Z5"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_days_type">Due Payment Type</Label>
              <SearchableSelect
                id="due_days_type"
                value={formData.due_days_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, due_days_type: value })
                }
                options={dueTypeOptions}
                placeholder="Select due days type"
                searchPlaceholder="Type payment type..."
              />
              <p className="text-xs text-muted-foreground">
                {formData.due_days_type === "fixed_days"
                  ? "Invoice due date will be issue date + specified days"
                  : "Invoice due date will always be the last day of the month"}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_days">
                {formData.due_days_type === "fixed_days"
                  ? "Due days to pay"
                  : "Days before end of the billed month"}
              </Label>
              <Input
                id="due_days"
                type="number"
                min="0"
                step="1"
                value={formData.due_days}
                onChange={(e) =>
                  setFormData({ ...formData, due_days: e.target.value })
                }
                placeholder={
                  formData.due_days_type === "fixed_days" ? "30" : "0"
                }
                disabled={formData.due_days_type === "end_of_month"}
              />
              {formData.due_days_type === "end_of_month" && (
                <p className="text-xs text-muted-foreground">
                  Automatically set to the last day of the month. Enter 0 for
                  same month-end, 1 for next month-end, etc.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <SearchableSelect
                id="country"
                value={formData.country}
                onValueChange={(value) =>
                  setFormData({ ...formData, country: value })
                }
                options={countryOptions}
                placeholder="Select country"
                searchPlaceholder="Type country..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              placeholder="123 Main Street"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="zip_code">Pincode</Label>
              <div className="relative">
                <Input
                  id="zip_code"
                  value={formData.zip_code}
                  onChange={(e) => handlePincodeChange(e.target.value)}
                  placeholder="6-digit pincode"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  disabled={fetchingPincode}
                />
                {fetchingPincode && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Spinner className="h-4 w-4" />
                  </div>
                )}
              </div>
              {fetchingPincode && (
                <p className="text-xs text-blue-600 flex items-center gap-1">
                  <Spinner className="h-3 w-3" />
                  Fetching location...
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                placeholder="Mumbai"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) =>
                  setFormData({ ...formData, state: e.target.value })
                }
                placeholder="Maharashtra"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              placeholder="Additional information about this client..."
              rows={4}
            />
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              type="submit"
              disabled={isLoading || fetchingPincode}
              className="min-w-32"
            >
              {isLoading ? (
                <>
                  <Spinner className="mr-2" />
                  {client ? "Updating..." : "Creating..."}
                </>
              ) : (
                <>{client ? "Update Client" : "Create Client"}</>
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
