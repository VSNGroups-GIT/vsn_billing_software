import { OperatorForm } from "@/components/operator-form"

export default function NewOperatorPage() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Add New Operator</h1>
        <p className="text-muted-foreground mt-1">Create a new operator record</p>
      </div>

      <div className="max-w-2xl">
        <OperatorForm />
      </div>
    </div>
  )
}
