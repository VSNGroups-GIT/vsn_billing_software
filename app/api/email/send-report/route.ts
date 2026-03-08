import { NextResponse } from "next/server"
import { sendEmail } from "@/lib/email/send-email"

export async function POST(request: Request) {
  try {
    const { to, subject, html } = await request.json()

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, html" },
        { status: 400 }
      )
    }

    const result = await sendEmail({
      to,
      subject,
      html,
    })

    if (!result?.success) {
      return NextResponse.json(
        { error: result?.error || "Failed to send email" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data: result.data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send email" },
      { status: 500 }
    )
  }
}
