"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { createUser, updateUser } from "@/app/actions/create-user"
import { useToast } from "@/hooks/use-toast"

interface Organization {
  id: string
  name: string
}

interface UserFormProps {
  organizations: Organization[]
  initialData?: {
    id: string
    email: string
    full_name: string
    role: string
    organization_id: string
    is_active: boolean
  }
}

export function UserForm({ organizations, initialData }: UserFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: initialData?.email || "",
    full_name: initialData?.full_name || "",
    password: "",
    role: initialData?.role || "accountant",
    organization_id: initialData?.organization_id || "",
    is_active: initialData?.is_active ?? true,
  })

  const roleOptions = [
    { value: "super_admin", label: "Super Admin" },
    { value: "admin", label: "Admin" },
    { value: "accountant", label: "Accountant" },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      let result

      if (initialData) {
        // Update existing user
        result = await updateUser(initialData.id, {
          full_name: formData.full_name,
          role: formData.role,
          is_active: formData.is_active,
        })
      } else {
        // Create new user
        result = await createUser({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          role: formData.role,
        })
      }

      if (result.error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error,
        })
      } else {
        toast({
          variant: "success",
          title: "Success",
          description: initialData ? "User updated successfully." : "User created successfully.",
        })
        await router.push("/dashboard/users")
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl bg-white p-6 rounded-lg border border-slate-200">
      <div className="space-y-4">
        <div>
          <Label htmlFor="full_name">Full Name</Label>
          <Input
            id="full_name"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            required
          />
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            disabled={!!initialData}
            required
          />
        </div>

        {!initialData && (
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={6}
            />
          </div>
        )}

        <div>
          <Label htmlFor="role">Role</Label>
          <SearchableSelect
            value={formData.role}
            onValueChange={(value) => setFormData({ ...formData, role: value })}
            options={roleOptions}
            placeholder="Select role"
            searchPlaceholder="Type role..."
            id="role"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Super Admin: Full access | Admin: View-only for super admin areas, full access where accountants have access | Accountant: Limited to invoices, products, payments, clients
          </p>
        </div>

        {initialData && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4"
            />
            <Label htmlFor="is_active">Active</Label>
          </div>
        )}
      </div>

      <div className="flex gap-4 mt-6">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : initialData ? "Update User" : "Create User"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/users")}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
