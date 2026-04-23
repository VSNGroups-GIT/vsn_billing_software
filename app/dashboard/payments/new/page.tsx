import { createClient } from "@/lib/supabase/server"
import { PaymentForm } from "@/components/payment-form"

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice_id?: string; client_id?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  // Fetch all clients
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, through_mediator")
    .order("name", { ascending: true })

  // Fetch unpaid or partially paid invoices with clients data and client_id
  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices")
    .select(`
      id,
      invoice_number,
      total_amount,
      amount_paid,
      status,
      issue_date,
      client_id,
      clients (
        name
      )
    `)
    .neq("status", "paid")
    .neq("status", "cancelled")
    .order("invoice_number", { ascending: false })

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Record Payment</h1>
        <p className="text-muted-foreground mt-1">Add a new payment record - record individual invoice or bulk client payment</p>
      </div>

      <div className="max-w-2xl">
        {!invoices || invoices.length === 0 ? (
          <div className="p-6 border rounded-lg bg-yellow-50 text-yellow-800">
            <p className="font-semibold">No invoices available for payment</p>
            <p className="text-sm mt-1">
              Create an invoice first or ensure there are unpaid invoices in the system.
            </p>
          </div>
        ) : (
          <PaymentForm
            invoices={invoices}
            clients={clients || []}
            preSelectedInvoiceId={params.invoice_id}
            preSelectedClientId={params.client_id}
          />
        )}
      </div>
    </div>
  )
}
