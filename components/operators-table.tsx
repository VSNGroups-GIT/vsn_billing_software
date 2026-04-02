"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Pencil, Trash2, Download, FileText } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { exportToCSV, ExportColumn, getTimestamp } from "@/lib/export-utils"

interface Operator {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

interface OperatorsTableProps {
  operators: Operator[]
}

export function OperatorsTable({ operators }: OperatorsTableProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [operatorToDelete, setOperatorToDelete] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    setIsDeleting(true)
    const supabase = createClient()

    const { error } = await supabase.from("operators").delete().eq("id", id)

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete operator. It may be mapped to existing products.",
      })
    } else {
      toast({
        variant: "success",
        title: "Operator deleted",
        description: "The operator has been deleted successfully.",
      })
      router.refresh()
    }

    setIsDeleting(false)
  }

  const handleExport = () => {
    const columns: ExportColumn[] = [
      { key: "name", label: "Operator Name" },
      { key: "description", label: "Description" },
      {
        key: "is_active",
        label: "Active",
        formatter: (val) => (val ? "Yes" : "No"),
      },
    ]

    exportToCSV(operators, columns, `operators-${getTimestamp()}.csv`)
    toast({
      variant: "success",
      title: "Exported",
      description: `${operators.length} operator(s) exported to CSV successfully.`,
    })
  }

  if (operators.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-white">
        <p className="text-muted-foreground">No operators found. Add your first operator to get started.</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={handleExport} size="sm" variant="outline" title="Export to CSV">
          <Download className="h-4 w-4" />
        </Button>
      </div>
      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table className="text-xs sm:text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {operators.map((operator) => (
              <TableRow key={operator.id}>
                <TableCell className="font-medium">{operator.name}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  {operator.description || <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell>
                  {operator.is_active ? (
                    <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1 sm:gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dashboard/operators/${operator.id}/edit`}>
                        <Pencil className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Link>
                    </Button>
                     <Button variant="ghost" size="sm" asChild title="Invoices">
                       <Link href={`/dashboard/operators/invoices?operator=${operator.id}`}>
                         <FileText className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600" />
                       </Link>
                     </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setOperatorToDelete(operator.id)
                        setDeleteDialogOpen(true)
                      }}
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete operator?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the operator.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => operatorToDelete && handleDelete(operatorToDelete)}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
