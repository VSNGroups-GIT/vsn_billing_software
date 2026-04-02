import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { DashboardPageWrapper } from "@/components/dashboard-page-wrapper"
import { MonthYearPicker } from "@/components/month-year-picker"
import { ReportsTable } from "@/components/reports-table"

export const revalidate = 0

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) {
    redirect("/dashboard")
  }

  const params = await searchParams
  const today = new Date()
  const todayDate = today.toISOString().split("T")[0]
  const reportYear = params.year ? parseInt(params.year) : today.getFullYear()
  const reportMonth = params.month ? parseInt(params.month) : today.getMonth() + 1

  const monthStart = `${reportYear}-${String(reportMonth).padStart(2, "0")}-01`
  const daysInMonth = new Date(reportYear, reportMonth, 0).getDate()
  const monthEnd = `${reportYear}-${String(reportMonth).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`

  const monthLabel = new Date(reportYear, reportMonth - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  })

  // Fetch all required data in parallel
  const [clientsResult, currentMonthInvoicesResult, allUnpaidInvoicesResult, currentMonthPaymentsResult, pricingRulesResult] =
    await Promise.all([
      supabase.from("clients").select("id, name").order("name", { ascending: true }),

      supabase
        .from("invoices")
        .select("id, client_id, issue_date, total_amount, invoice_items(product_id, quantity, line_total)")
        .gte("issue_date", monthStart)
        .lte("issue_date", monthEnd),

      supabase
        .from("invoices")
        .select("client_id, total_amount, amount_paid, issue_date")
        .neq("status", "cancelled")
        .neq("status", "paid"),

      supabase
        .from("payments")
        .select("amount, invoices(client_id)")
        .gte("payment_date", monthStart)
        .lte("payment_date", monthEnd),

      supabase
        .from("client_product_pricing")
        .select("client_id, product_id, operator_price, products(paper_price)"),
    ])

  const clients = clientsResult.data || []
  const currentMonthInvoices = currentMonthInvoicesResult.data || []
  const allUnpaidInvoices = allUnpaidInvoicesResult.data || []
  const currentMonthPayments = currentMonthPaymentsResult.data || []
  const pricingRules = pricingRulesResult.data || []

  const pricingMap = new Map<string, number>()
  for (const rule of pricingRules) {
    const key = `${rule.client_id}::${rule.product_id}`
    const fallbackPaperPrice = Number((rule.products as { paper_price: string } | null)?.paper_price || 0)
    pricingMap.set(key, Number(rule.operator_price ?? fallbackPaperPrice))
  }

  type ClientRow = {
    id: string
    name: string
    sale: number
    todaySaleQty: number
    todaySaleValue: number
    operatorCost: number
    marginValue: number
    marginPercent: number
    payments: number
    outstanding: number
    oldBal: number
  }

  const clientMap = new Map<string, ClientRow>()
  for (const client of clients) {
    clientMap.set(client.id, {
      id: client.id,
      name: client.name,
      sale: 0,
      todaySaleQty: 0,
      todaySaleValue: 0,
      operatorCost: 0,
      marginValue: 0,
      marginPercent: 0,
      payments: 0,
      outstanding: 0,
      oldBal: 0,
    })
  }

  for (const invoice of currentMonthInvoices) {
    const row = clientMap.get(invoice.client_id)
    if (!row) continue
    row.sale += Number(invoice.total_amount)
    const items = (invoice.invoice_items as { quantity: string | number | null }[] | null) ?? []
    const invoiceQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    const invoiceCost = (
      invoice.invoice_items as
        | { product_id: string | null; quantity: string | number | null; line_total: string | number | null }[]
        | null
    )?.reduce((sum, item) => {
      if (!item.product_id) return sum
      const priceKey = `${invoice.client_id}::${item.product_id}`
      const operatorPrice = pricingMap.get(priceKey) ?? 0
      return sum + Number(item.quantity || 0) * operatorPrice
    }, 0) ?? 0

    row.operatorCost += invoiceCost
    row.marginValue = row.sale - row.operatorCost
    row.marginPercent = row.sale > 0 ? (row.marginValue / row.sale) * 100 : 0
    if (invoice.issue_date === todayDate) {
      row.todaySaleQty += invoiceQty
      row.todaySaleValue += Number(invoice.total_amount || 0)
    }
  }

  for (const invoice of allUnpaidInvoices) {
    const balance = Number(invoice.total_amount) - Number(invoice.amount_paid)
    if (balance <= 0) continue
    const row = clientMap.get(invoice.client_id)
    if (!row) continue
    row.outstanding += balance
    if (invoice.issue_date < monthStart) {
      row.oldBal += balance
    }
  }

  for (const payment of currentMonthPayments) {
    const clientId = (payment.invoices as unknown as { client_id: string } | null)?.client_id
    if (!clientId) continue
    const row = clientMap.get(clientId)
    if (!row) continue
    row.payments += Number(payment.amount)
  }

  const rows = Array.from(clientMap.values()).filter(
    (r) => r.sale > 0 || r.payments > 0 || r.outstanding > 0 || r.oldBal > 0,
  )

  return (
    <DashboardPageWrapper title="Reports">
      <div className="w-full p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Monthly Report:{" "}
              <span className="font-semibold text-foreground">{monthLabel}</span>
            </p>
          </div>
          <MonthYearPicker currentYear={reportYear} currentMonth={reportMonth} />
        </div>

        <ReportsTable rows={rows} daysInMonth={daysInMonth} monthLabel={monthLabel} />
      </div>
    </DashboardPageWrapper>
  )
}
