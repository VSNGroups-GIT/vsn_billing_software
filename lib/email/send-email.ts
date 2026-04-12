import { Resend } from "resend"

interface SendEmailParams {
  to: string
  subject: string
  html: string
  from?: string
}

export async function sendEmail({ to, subject, html, from }: SendEmailParams) {
  try {
    const resendApiKey = process.env.RESEND_API_KEY
    const emailFrom = process.env.EMAIL_FROM

    // Validate API key is set
    if (!resendApiKey) {
      return { success: false, error: "Email service not configured: missing API key" }
    }

    // Initialize Resend client at function call time (not module load time)
    const resend = new Resend(resendApiKey)

    // Validate recipient email
    if (!to || !to.includes("@")) {
      return { success: false, error: "Invalid recipient email address" }
    }

    const fromEmail = from || emailFrom || "onboarding@resend.dev"

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
