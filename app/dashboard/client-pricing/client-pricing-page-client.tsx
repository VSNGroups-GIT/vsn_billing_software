"use client"

import { useState } from "react"
import { ClientSelector } from "@/components/client-selector"
import { ClientPricingTable } from "@/components/client-pricing-table"

interface PricingRule {
  id: string
  client_id: string
  product_id: string
  operator_price: number | null
  price_rule_type: string
  price_rule_value: string | null
  fixed_base_value: number | null
  notes: string | null
  created_at: string
  conditional_threshold?: number | null
  conditional_discount_below?: number | null
  conditional_discount_above_equal?: number | null
  clients: { name: string }
  products: { name: string; paper_price: string }
}

interface Client {
  id: string
  name: string
}

interface ClientPricingPageClientProps {
  pricingRules: PricingRule[]
  clients: Client[]
  userRole?: string
}

export function ClientPricingPageClient({ pricingRules, clients, userRole }: ClientPricingPageClientProps) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  const filteredRules =
    selectedClientId === null ? pricingRules : pricingRules.filter((rule) => rule.client_id === selectedClientId)

  return (
    <div className="space-y-4">
      <ClientPricingTable
        pricingRules={filteredRules}
        userRole={userRole}
        toolbarLeft={(
          <ClientSelector clients={clients} selectedClientId={selectedClientId} onClientChange={setSelectedClientId} />
        )}
      />
    </div>
  )
}
