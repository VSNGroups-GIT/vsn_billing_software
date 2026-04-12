"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { sendEmail } from "@/lib/email/send-email"
import { getTeamMemberWelcomeEmail } from "@/lib/email/templates/team-member-welcome"

export async function createUser(formData: {
  email: string
  full_name: string
  role: string
  password: string
}) {
  const supabase = await createClient()

  // Get current user and verify they're admin
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single()

  if (adminProfile?.role !== "super_admin") {
    return { error: "Only super admins can create users" }
  }

  if (!adminProfile.organization_id) {
    return { error: "Admin must have an organization" }
  }

  try {
    // Use admin client to create user
    const adminClient = createAdminClient()

    // Get organization details for email
    const { data: organization } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", adminProfile.organization_id)
      .single()

    // Create auth user
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email: formData.email,
      password: formData.password,
      email_confirm: true,
      user_metadata: {
        full_name: formData.full_name,
        role: formData.role,
      },
    })

    if (authError) throw authError
    if (!authUser.user) throw new Error("User creation failed")

    // Create profile directly using admin client (bypasses RLS)
    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: authUser.user.id,
      email: formData.email,
      full_name: formData.full_name,
      role: formData.role,
      is_active: true,
      organization_id: adminProfile.organization_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (profileError) throw profileError

    // Send welcome email to new team member
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/login`
    const emailHtml = getTeamMemberWelcomeEmail({
      name: formData.full_name,
      email: formData.email,
      password: formData.password,
      role: formData.role,
      organizationName: organization?.name || "Your Organization",
      loginUrl,
    })

    const emailResult = await sendEmail({
      to: formData.email,
      subject: `Welcome to ${organization?.name || "the Team"}!`,
      html: emailHtml,
    })

    if (!emailResult.success) {
      console.error(`[CreateUser] Failed to send welcome email to ${formData.email}: ${emailResult.error}`)
    }

    revalidatePath("/dashboard/users")
    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function updateUser(
  userId: string,
  formData: {
    full_name: string
    role: string
    is_active: boolean
  },
) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Get current user and verify they're admin
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const { data: adminProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

  if (adminProfile?.role !== "super_admin") {
    return { error: "Only super admins can update users" }
  }

  try {
    // Get current user state to check if activation status is changing
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", userId)
      .single()

    // If toggling activation state, handle via Admin API (auth + profile)
    if (currentProfile && currentProfile.is_active !== formData.is_active) {
      if (formData.is_active === true) {
        // Reactivate: unban auth user
        const { error: unbanError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: "none" } as any)
        if (unbanError) throw new Error(unbanError.message)
      } else {
        // Deactivate: ban auth user for long duration
        const { error: banError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: "876000h" } as any)
        if (banError) throw new Error(banError.message)
      }

      // Update profile via admin client to bypass RLS
      const { error: profileUpdateError } = await adminClient
        .from("profiles")
        .update({
          is_active: formData.is_active,
          full_name: formData.full_name,
          role: formData.role,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)

      if (profileUpdateError) throw new Error(profileUpdateError.message)
    } else {
      // No activation state change: update profile fields only (use admin client to avoid RLS)
      const { error: profileError } = await adminClient
        .from("profiles")
        .update({
          full_name: formData.full_name,
          role: formData.role,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
      if (profileError) throw new Error(profileError.message)
    }

    revalidatePath("/dashboard/users", "page")
    revalidatePath("/dashboard/users", "layout")
    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}
