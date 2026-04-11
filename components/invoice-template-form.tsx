"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"

interface InvoiceTemplate {
  id?: string
  template_type?: TemplateType
  company_name: string
  company_tagline?: string
  company_address: string
  company_phone: string
  company_email: string
  company_logo_url: string
  company_logo_file: string | null
  company_stamp_url: string
  company_stamp_file: string | null
  signatory_label: string
  tax_label: string
  note_content: string
  payment_instructions: string
  terms_and_conditions: string
  whatsapp_template_rows: WhatsAppTemplateRow[]
}

interface WhatsAppTemplateRow {
  category: string
  price_per_message: string
  template_type: string
}

interface InvoiceTemplateFormProps {
  existingTemplate?: InvoiceTemplate | null
  templateType: TemplateType
  title: string
  description: string
  enableWhatsappTable?: boolean
}

type TemplateType = "invoice" | "quotation_whatsapp" | "quotation_other"

const DEFAULT_LOGO_URL = "/VSN_Groups_LOGO-removebg-preview.png"
const DEFAULT_STAMP_URL = "/hyd_stamp_%26_Sign.png"
const DEFAULT_SIGNATORY_LABEL = "Authorized Signatory"

const DEFAULT_WHATSAPP_TEMPLATE_ROWS: WhatsAppTemplateRow[] = [
  {
    category: "Marketing",
    price_per_message: "89.5-Paisa",
    template_type:
      "Include promotions or offers, informational updates, or invitation for customers to respond/take action. Any conversation that does not qualify as utility or authentication",
  },
  {
    category: "Utility",
    price_per_message: "25-Paisa",
    template_type:
      "Facilitate a specific, agreed-upon request or transaction or update to a customer about an ongoing transaction, including post-purchase notifications and recurring billing",
  },
  {
    category: "Authentication",
    price_per_message: "16-Paisa",
    template_type:
      "Enable businesses to authenticate users with one-time passcodes, potentially at multiple steps in the login process(e.g., account verification, account recovery, integrity challenges)",
  },
  {
    category: "Service",
    price_per_message: "0-Paisa",
    template_type:
      "All user-initiated conversations will be categorized as service conversations, which help customers resolve enquiries.",
  },
]

const normalizeWhatsappTemplateRows = (rows: unknown): WhatsAppTemplateRow[] => {
  if (!Array.isArray(rows)) return DEFAULT_WHATSAPP_TEMPLATE_ROWS

  const normalizedRows = rows
    .map((row) => {
      if (!row || typeof row !== "object") return null
      const candidate = row as Partial<WhatsAppTemplateRow>
      return {
        category: typeof candidate.category === "string" ? candidate.category : "",
        price_per_message: typeof candidate.price_per_message === "string" ? candidate.price_per_message : "",
        template_type: typeof candidate.template_type === "string" ? candidate.template_type : "",
      }
    })
    .filter((row): row is WhatsAppTemplateRow => !!row)
    .filter((row) => row.category || row.price_per_message || row.template_type)

  return normalizedRows.length > 0 ? normalizedRows : DEFAULT_WHATSAPP_TEMPLATE_ROWS
}

export function InvoiceTemplateForm({
  existingTemplate,
  templateType,
  title,
  description,
  enableWhatsappTable = false,
}: InvoiceTemplateFormProps) {
  const isEditingExistingTemplate = Boolean(existingTemplate)
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(
    existingTemplate?.company_logo_file || existingTemplate?.company_logo_url || DEFAULT_LOGO_URL
  )
  const [stampPreview, setStampPreview] = useState<string | null>(
    existingTemplate?.company_stamp_file || existingTemplate?.company_stamp_url || (isEditingExistingTemplate ? null : DEFAULT_STAMP_URL)
  )

  const [formData, setFormData] = useState<InvoiceTemplate>({
    template_type: templateType,
    company_name: existingTemplate?.company_name || "",
    company_tagline: existingTemplate?.company_tagline || "",
    company_address: existingTemplate?.company_address || "",
    company_phone: existingTemplate?.company_phone || "",
    company_email: existingTemplate?.company_email || "",
    company_logo_url: existingTemplate?.company_logo_url || (existingTemplate?.company_logo_file ? "" : DEFAULT_LOGO_URL),
    company_logo_file: existingTemplate?.company_logo_file || null,
    company_stamp_url: isEditingExistingTemplate
      ? (existingTemplate?.company_stamp_url ?? "")
      : (existingTemplate?.company_stamp_file ? "" : DEFAULT_STAMP_URL),
    company_stamp_file: existingTemplate?.company_stamp_file || null,
    signatory_label: isEditingExistingTemplate
      ? (existingTemplate?.signatory_label ?? "")
      : DEFAULT_SIGNATORY_LABEL,
    tax_label:
      existingTemplate?.tax_label === "GST"
        ? "IGST"
        : existingTemplate?.tax_label || "IGST",
    note_content:
      existingTemplate?.note_content ||
      "1. Material once sold will not be taken back.\n2. Kindly verify quantity and amount before confirmation.",
    payment_instructions:
      existingTemplate?.payment_instructions ||
      "1. Please make all payments to the company account only.\n2. Share payment confirmation with transaction reference.\n3. Contact billing support for any clarification.",
    terms_and_conditions: existingTemplate?.terms_and_conditions || "Payment is due within 30 days. Late payments may incur additional charges.",
    whatsapp_template_rows: enableWhatsappTable
      ? normalizeWhatsappTemplateRows(existingTemplate?.whatsapp_template_rows)
      : DEFAULT_WHATSAPP_TEMPLATE_ROWS,
  })

  const updateWhatsappRow = (index: number, field: keyof WhatsAppTemplateRow, value: string) => {
    setFormData({
      ...formData,
      whatsapp_template_rows: formData.whatsapp_template_rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      ),
    })
  }

  const addWhatsappRow = () => {
    setFormData({
      ...formData,
      whatsapp_template_rows: [
        ...formData.whatsapp_template_rows,
        { category: "", price_per_message: "", template_type: "" },
      ],
    })
  }

  const removeWhatsappRow = (index: number) => {
    setFormData({
      ...formData,
      whatsapp_template_rows: formData.whatsapp_template_rows.filter((_, rowIndex) => rowIndex !== index),
    })
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        setError("Please upload an image file")
        return
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setError("Image size should be less than 2MB")
        return
      }

      const reader = new FileReader()
      reader.onloadend = () => {
        const base64String = reader.result as string
        setFormData({ ...formData, company_logo_file: base64String, company_logo_url: "" })
        setLogoPreview(base64String)
        setError(null)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleStampFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith("image/")) {
        setError("Please upload an image file")
        return
      }

      if (file.size > 2 * 1024 * 1024) {
        setError("Image size should be less than 2MB")
        return
      }

      const reader = new FileReader()
      reader.onloadend = () => {
        const base64String = reader.result as string
        setFormData({ ...formData, company_stamp_file: base64String, company_stamp_url: "" })
        setStampPreview(base64String)
        setError(null)
      }
      reader.readAsDataURL(file)
    }
  }

  const clearLogo = () => {
    setFormData({ ...formData, company_logo_file: null, company_logo_url: "" })
    setLogoPreview(null)
  }

  const clearStamp = () => {
    setFormData({ ...formData, company_stamp_file: null, company_stamp_url: "" })
    setStampPreview(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError("You must be logged in")
      setIsLoading(false)
      return
    }

    try {
      // Get user's organization
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single()

      if (!profile?.organization_id) {
        throw new Error("User must belong to an organization")
      }

      const payload = {
        ...formData,
        template_type: templateType,
        organization_id: profile.organization_id,
      }

      if (existingTemplate?.id) {
        // Update existing template
        const { error } = await supabase
          .from("invoice_templates")
          .update(payload)
          .eq("id", existingTemplate.id)

        if (error) throw error
      } else {
        // Create new template (upsert to handle unique constraint)
        const { error } = await supabase
          .from("invoice_templates")
          .upsert(payload, { onConflict: "organization_id,template_type" })

        if (error) throw error
      }

      toast({
        variant: "success",
        title: "Success",
        description: `${title} updated successfully!`,
      })
      router.push("/dashboard/settings")
      router.refresh()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred"
      setError(message)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error updating settings: " + message,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company_name">
                Company Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="company_name"
                required
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                placeholder="Your Company Name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company_email">
                Company Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="company_email"
                type="email"
                required
                value={formData.company_email}
                onChange={(e) => setFormData({ ...formData, company_email: e.target.value })}
                placeholder="info@company.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company_phone">
                Company Phone <span className="text-red-500">*</span>
              </Label>
              <Input
                id="company_phone"
                required
                value={formData.company_phone}
                onChange={(e) => setFormData({ ...formData, company_phone: e.target.value })}
                placeholder="+91 00000 00000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax_label">Tax Label</Label>
              <Input
                id="tax_label"
                value={formData.tax_label}
                onChange={(e) => setFormData({ ...formData, tax_label: e.target.value })}
                placeholder="IGST"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_address">
              Company Address <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="company_address"
              required
              value={formData.company_address}
              onChange={(e) => setFormData({ ...formData, company_address: e.target.value })}
              placeholder="123 Business Street, City, State 12345"
              rows={2}
            />
          </div>

          {templateType !== "invoice" && (
            <div className="space-y-2">
              <Label htmlFor="company_tagline">Company Tagline</Label>
              <Input
                id="company_tagline"
                value={formData.company_tagline || ""}
                onChange={(e) => setFormData({ ...formData, company_tagline: e.target.value })}
                placeholder="Your trusted communication partner"
              />
            </div>
          )}

          <div className="space-y-3">
            <Label>Company Logo</Label>
            <div className="grid gap-4">
              {/* Option 1: Upload File */}
              <div className="space-y-2">
                <Label htmlFor="company_logo_file" className="text-sm font-normal">
                  Upload Logo File
                </Label>
                <Input
                  id="company_logo_file"
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={!!formData.company_logo_url}
                />
                <p className="text-xs text-muted-foreground">
                  Upload your logo (PNG, JPG, max 2MB)
                </p>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              {/* Option 2: URL */}
              <div className="space-y-2">
                <Label htmlFor="company_logo_url" className="text-sm font-normal">
                  Logo URL
                </Label>
                <Input
                  id="company_logo_url"
                  type="url"
                  value={formData.company_logo_url}
                  onChange={(e) => {
                    setFormData({ ...formData, company_logo_url: e.target.value, company_logo_file: null })
                    setLogoPreview(e.target.value)
                  }}
                  placeholder="https://example.com/logo.png"
                  disabled={!!formData.company_logo_file}
                />
                <p className="text-xs text-muted-foreground">
                  Or provide a URL to your company logo
                </p>
              </div>

              {/* Preview */}
              {logoPreview && (
                <div className="space-y-2">
                  <Label className="text-sm font-normal">Preview</Label>
                  <div className="relative inline-block">
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="h-20 w-auto object-contain border rounded-md p-2"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                      onClick={clearLogo}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Authorized Signatory Stamp</Label>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="company_stamp_file" className="text-sm font-normal">
                  Upload Stamp File
                </Label>
                <Input
                  id="company_stamp_file"
                  type="file"
                  accept="image/*"
                  onChange={handleStampFileUpload}
                  disabled={!!formData.company_stamp_url}
                />
                <p className="text-xs text-muted-foreground">
                  Upload stamp/signature image (PNG, JPG, max 2MB)
                </p>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="company_stamp_url" className="text-sm font-normal">
                  Stamp URL
                </Label>
                <Input
                  id="company_stamp_url"
                  type="url"
                  value={formData.company_stamp_url}
                  onChange={(e) => {
                    setFormData({ ...formData, company_stamp_url: e.target.value, company_stamp_file: null })
                    setStampPreview(e.target.value)
                  }}
                  placeholder="https://example.com/stamp.png"
                  disabled={!!formData.company_stamp_file}
                />
                <p className="text-xs text-muted-foreground">
                  Or provide a URL to your stamp/signature image
                </p>
              </div>

              {stampPreview && (
                <div className="space-y-2">
                  <Label className="text-sm font-normal">Preview</Label>
                  <div className="relative inline-block">
                    <img
                      src={stampPreview}
                      alt="Stamp preview"
                      className="h-20 w-auto object-contain border rounded-md p-2"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                      onClick={clearStamp}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signatory_label">Signatory Label</Label>
            <Input
              id="signatory_label"
              value={formData.signatory_label}
              onChange={(e) => setFormData({ ...formData, signatory_label: e.target.value })}
              placeholder="Authorized Signatory"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note_content">Notes (Print Template)</Label>
            <Textarea
              id="note_content"
              value={formData.note_content}
              onChange={(e) => setFormData({ ...formData, note_content: e.target.value })}
              placeholder="Line-wise notes shown in invoice print"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_instructions">Payment Instructions (Print Template)</Label>
            <Textarea
              id="payment_instructions"
              value={formData.payment_instructions}
              onChange={(e) => setFormData({ ...formData, payment_instructions: e.target.value })}
              placeholder="Line-wise payment instructions shown in invoice print"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="terms_and_conditions">Terms & Conditions</Label>
            <Textarea
              id="terms_and_conditions"
              value={formData.terms_and_conditions}
              onChange={(e) => setFormData({ ...formData, terms_and_conditions: e.target.value })}
              placeholder="Payment terms and conditions..."
              rows={4}
            />
          </div>

          {enableWhatsappTable && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>WhatsApp Quotation Category Table</Label>
                  <p className="text-sm text-muted-foreground">
                    Configure the rows shown in the WhatsApp quotation category pricing table.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={addWhatsappRow}>
                  Add Row
                </Button>
              </div>

              <div className="space-y-4">
                {formData.whatsapp_template_rows.map((row, index) => (
                  <div key={`${row.category}-${index}`} className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-medium">Row {index + 1}</p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeWhatsappRow(index)}
                        disabled={formData.whatsapp_template_rows.length === 1}
                      >
                        Remove
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Input
                          value={row.category}
                          onChange={(e) => updateWhatsappRow(index, "category", e.target.value)}
                          placeholder="Marketing"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Price per Message</Label>
                        <Input
                          value={row.price_per_message}
                          onChange={(e) => updateWhatsappRow(index, "price_per_message", e.target.value)}
                          placeholder="89.5-Paisa"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Type of Template</Label>
                      <Textarea
                        value={row.template_type}
                        onChange={(e) => updateWhatsappRow(index, "template_type", e.target.value)}
                        placeholder="Template description shown in the WhatsApp quotation"
                        rows={3}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}

          <div className="flex gap-4">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : existingTemplate ? `Update ${title}` : `Save ${title}`}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
