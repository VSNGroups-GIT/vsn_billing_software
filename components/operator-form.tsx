"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState } from "react"

interface Operator {
  id: string
  name: string
  description: string | null
  is_active: boolean
}

interface OperatorFormProps {
  operator?: Operator
}

export function OperatorForm({ operator }: OperatorFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: operator?.name || "",
    description: operator?.description || "",
    is_active: operator?.is_active ?? true,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const supabase = createClient()

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
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single()

      if (!profile?.organization_id) {
        throw new Error("User must belong to an organization")
      }

      if (operator) {
        const { error } = await supabase
          .from("operators")
          .update({
            name: formData.name,
            description: formData.description,
            is_active: formData.is_active,
          })
          .eq("id", operator.id)

        if (error) throw error

        toast({
          variant: "success",
          title: "Operator updated",
          description: "Operator information has been updated successfully.",
        })
      } else {
        const { error } = await supabase.from("operators").insert({
          name: formData.name,
          description: formData.description,
          is_active: formData.is_active,
          created_by: user.id,
          organization_id: profile.organization_id,
        })

        if (error) throw error

        toast({
          variant: "success",
          title: "Operator created",
          description: `${formData.name} has been added successfully.`,
        })
      }

      router.push("/dashboard/operators")
      router.refresh()
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred. Please try again."

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
            <Label htmlFor="name">Operator Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter operator name"
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

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="is_active" className="text-base">Active Status</Label>
              <p className="text-sm text-muted-foreground">Allow this operator to be selected for products</p>
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
                  {operator ? "Updating..." : "Creating..."}
                </>
              ) : (
                <>{operator ? "Update Operator" : "Create Operator"}</>
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
