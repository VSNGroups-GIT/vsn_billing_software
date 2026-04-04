"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { createUser, updateUser } from "@/app/actions/create-user"
import { useToast } from "@/hooks/use-toast"
import { Eye, EyeOff } from "lucide-react"

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

  const [showPassword, setShowPassword] = useState(false)

  const roleOptions = [
    { value: "super_admin", label: "Super Admin" },
    { value: "admin", label: "Admin" },
    { value: "billing_executive", label: "Billing Executive" },
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
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="Enter full name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Enter email address"
              disabled={!!initialData}
              required
            />
          </div>

          {!initialData && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Minimum 6 characters"
                  required
                  minLength={6}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <SearchableSelect
              value={formData.role}
              onValueChange={(value) => setFormData({ ...formData, role: value })}
              options={roleOptions}
              placeholder="Select role"
              searchPlaceholder="Type role..."
              id="role"
            />
            <p className="text-xs text-muted-foreground">
              Super Admin: Full access | Admin: Full access except Team and Settings are read-only | Billing Executive: Invoices, Quotations, Payments full access + Clients/Products view-only | Accountant: GST filing tab only
            </p>
          </div>

          {initialData && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="is_active" className="text-base">Active Status</Label>
                <p className="text-sm text-muted-foreground">Allow this user to access the system</p>
              </div>
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4"
              />
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <Button type="submit" disabled={loading} className="min-w-32">
              {loading ? "Saving..." : initialData ? "Update User" : "Create User"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/users")}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
