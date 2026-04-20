"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState } from "react"

interface Product {
  id: string
  name: string
  description: string | null
  hsn_code?: string | null
  operator_price?: string | number | null
  is_active: boolean
  operator_id?: string | null
}

interface Operator {
  id: string
  name: string
  is_active: boolean
}

interface ProductFormProps {
  product?: Product
  operators: Operator[]
  userRole?: string
}

export function ProductForm({ product, operators, userRole }: ProductFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: product?.name || "",
    description: product?.description || "",
    hsn_code: product?.hsn_code || "",
    operator_price: String(product?.operator_price ?? "0"),
    is_active: product?.is_active ?? true,
    operator_id: product?.operator_id || "",
  })

  const operatorOptions = operators
    .filter((operator) => operator.is_active || operator.id === formData.operator_id)
    .map((operator) => ({ value: operator.id, label: operator.name }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const supabase = createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast({
        variant: "destructive",
        title: "Authentication required",
        description: "You must be logged in to perform this action.",
      })
      setIsLoading(false)
      return
    }

    try {
      if (!formData.operator_id) {
        toast({
          variant: "destructive",
          title: "Operator required",
          description: "Please select an operator for this product.",
        })
        setIsLoading(false)
        return
      }

      // Get user's organization
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single()

      if (!profile?.organization_id) {
        throw new Error("User must belong to an organization")
      }

      if (product) {
        // Update existing product (only fields in use)
        const { error } = await supabase
          .from("products")
          .update({
            name: formData.name,
            description: formData.description,
            hsn_code: formData.hsn_code || null,
            operator_price: Number(formData.operator_price || 0),
            is_active: formData.is_active,
            operator_id: formData.operator_id,
          })
          .eq("id", product.id)

        if (error) throw error
        
        toast({
          variant: "success",
          title: "Product updated",
          description: "Product information has been updated successfully.",
        })
      } else {
        // Create new product (defaults for deprecated pricing fields)
        const { error } = await supabase.from("products").insert({
          name: formData.name,
          description: formData.description,
          hsn_code: formData.hsn_code || null,
          operator_price: Number(formData.operator_price || 0),
          is_active: formData.is_active,
          unit_price: 0,
          paper_price: Number(formData.operator_price || 0),
          unit: "unit",
          tax_rate: 0,
          operator_id: formData.operator_id,
          created_by: user.id,
          organization_id: profile.organization_id,
        })

        if (error) throw error
        
        toast({
          variant: "success",
          title: "Product created",
          description: `${formData.name} has been added successfully.`,
        })
      }

      router.push("/dashboard/products")
      router.refresh()
    } catch (error: unknown) {
      let errorMessage = "An unexpected error occurred. Please try again."
      
      if (error instanceof Error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          errorMessage = "A product with this name already exists."
        } else if (error.message.includes('organization')) {
          errorMessage = "Organization error: Please contact support."
        } else {
          errorMessage = error.message
        }
      }
      
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Product Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter product name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hsn_code">HSN Code</Label>
            <Input
              id="hsn_code"
              value={formData.hsn_code}
              onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
              placeholder="Enter HSN code"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="operator_id">Operator</Label>
            <SearchableSelect
              id="operator_id"
              value={formData.operator_id}
              onValueChange={(value) => setFormData({ ...formData, operator_id: value })}
              options={operatorOptions}
              placeholder="Select operator"
              searchPlaceholder="Type operator name..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="operator_price">Operator Price (Cost) (₹)</Label>
            <Input
              id="operator_price"
              type="number"
              min="0"
              step="0.00000001"
              value={formData.operator_price}
              onChange={(e) => setFormData({ ...formData, operator_price: e.target.value })}
              placeholder="Enter operator cost price"
              required
            />
            <p className="text-xs text-muted-foreground">Used for margin calculations in pricing and reports.</p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="is_active" className="text-base">Active Status</Label>
              <p className="text-sm text-muted-foreground">Make this product available for invoicing</p>
            </div>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>

          <div className="flex gap-4 pt-4">
            <Button type="submit" disabled={isLoading} className="min-w-32">
              {isLoading ? (
                <>
                  <Spinner className="mr-2" />
                  {product ? "Updating..." : "Creating..."}
                </>
              ) : (
                <>{product ? "Update Product" : "Create Product"}</>
              )}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
