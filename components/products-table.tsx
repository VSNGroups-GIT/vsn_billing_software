"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Pencil, Trash2, Download, ArrowUpDown, ArrowUp, ArrowDown, GripVertical } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState, useMemo } from "react"
import { usePagination } from "@/hooks/use-pagination"
import { TablePagination } from "@/components/table-pagination"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
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
import { exportToCSVAsync, ExportColumn, getTimestamp } from "@/lib/export-utils"
import { Input } from "@/components/ui/input"

interface Product {
  id: string
  name: string
  description: string | null
  hsn_code?: string | null
  operator_price?: string | number | null
  is_active: boolean
  created_at: string
  position?: number
  operators?: {
    name: string
  } | null
  profiles?: {
    full_name: string
  }
}

interface ProductsTableProps {
  products: Product[]
  userRole?: string
}

function SortableProductRow({
  product,
  onDelete,
  isViewOnly,
}: {
  product: Product
  onDelete: (id: string) => void
  isViewOnly: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <TableRow ref={setNodeRef} style={style} className="text-xs sm:text-sm">
      <TableCell className="w-[40px] sm:w-[50px] px-2 sm:px-4 py-2 sm:py-3">
        {!isViewOnly && (
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing hover:bg-muted rounded p-1 inline-flex"
          >
            <GripVertical className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </div>
        )}
      </TableCell>
      <TableCell className="font-medium px-2 sm:px-4 py-2 sm:py-3 max-w-[100px] sm:max-w-none truncate">{product.name}</TableCell>
      <TableCell className="hidden sm:table-cell px-2 sm:px-4 py-2 sm:py-3 max-w-xs truncate">
        {product.description || <span className="text-muted-foreground">-</span>}
      </TableCell>
      <TableCell className="hidden lg:table-cell px-2 sm:px-4 py-2 sm:py-3 max-w-[120px] truncate">
        {product.hsn_code || <span className="text-muted-foreground">-</span>}
      </TableCell>
      <TableCell className="hidden md:table-cell px-2 sm:px-4 py-2 sm:py-3 max-w-xs truncate">
        {product.operators?.name || <span className="text-muted-foreground">-</span>}
      </TableCell>
      <TableCell className="hidden lg:table-cell px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
        ₹{Number(product.operator_price || 0).toFixed(2)}
      </TableCell>
      <TableCell className="px-2 sm:px-4 py-2 sm:py-3">
        {product.is_active ? (
          <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
            Active
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">Inactive</Badge>
        )}
      </TableCell>
      <TableCell className="text-right px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex justify-end gap-1 sm:gap-2">
          {!isViewOnly && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/dashboard/products/${product.id}/edit`}>
                  <Pencil className="h-3 w-3 sm:h-4 sm:w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(product.id)}
              >
                <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

export function ProductsTable({ products, userRole }: ProductsTableProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<string | null>(null)
  const isViewOnly = userRole === "billing_executive"

  // Drag and drop setup
  const [orderedProducts, setOrderedProducts] = useState(products)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Pagination state
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Filter state
  const [filters, setFilters] = useState({
    name: '',
    description: '',
    hsn_code: '',
    operator: '',
    operator_price: '',
  })

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const handleFilterChange = (column: string, value: string) => {
    setFilters(prev => ({ ...prev, [column]: value }))
  }

  // Apply filtering and sorting
  const processedProducts = useMemo(() => {
    let filtered = [...orderedProducts]

    // Apply filters
    if (filters.name) {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(filters.name.toLowerCase())
      )
    }
    if (filters.description) {
      filtered = filtered.filter(p => 
        (p.description || '').toLowerCase().includes(filters.description.toLowerCase())
      )
    }
    if (filters.hsn_code) {
      filtered = filtered.filter(p =>
        (p.hsn_code || '').toLowerCase().includes(filters.hsn_code.toLowerCase())
      )
    }
    if (filters.operator) {
      filtered = filtered.filter(p =>
        (p.operators?.name || '').toLowerCase().includes(filters.operator.toLowerCase())
      )
    }
    if (filters.operator_price) {
      filtered = filtered.filter((p) =>
        String(Number(p.operator_price || 0).toFixed(2)).includes(filters.operator_price),
      )
    }

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        let aVal: any
        let bVal: any

        switch (sortColumn) {
          case 'name':
            aVal = a.name
            bVal = b.name
            break
          case 'description':
            aVal = a.description || ''
            bVal = b.description || ''
            break
          case 'hsn_code':
            aVal = a.hsn_code || ''
            bVal = b.hsn_code || ''
            break
          case 'is_active':
            aVal = a.is_active ? 1 : 0
            bVal = b.is_active ? 1 : 0
            break
          case 'operator':
            aVal = a.operators?.name || ''
            bVal = b.operators?.name || ''
            break
          case 'operator_price':
            aVal = Number(a.operator_price || 0)
            bVal = Number(b.operator_price || 0)
            break
          default:
            return 0
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    }

    return filtered
  }, [orderedProducts, filters, sortColumn, sortDirection])

  const pagination = usePagination({
    items: processedProducts,
    itemsPerPage,
  })

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-2 h-4 w-4 inline opacity-40" />
    return sortDirection === 'asc' 
      ? <ArrowUp className="ml-2 h-4 w-4 inline" />
      : <ArrowDown className="ml-2 h-4 w-4 inline" />
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = orderedProducts.findIndex((prod) => prod.id === active.id)
      const newIndex = orderedProducts.findIndex((prod) => prod.id === over.id)

      const newOrder = arrayMove(orderedProducts, oldIndex, newIndex)
      setOrderedProducts(newOrder)

      // Persist the new order to the database
      const supabase = createClient()
      const updates = newOrder.map((prod, index) => ({
        id: prod.id,
        position: index,
      }))

      try {
        for (const update of updates) {
          await supabase
            .from("products")
            .update({ position: update.position })
            .eq("id", update.id)
        }
        toast({
          variant: "success",
          title: "Order updated",
          description: "Product order has been saved.",
        })
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to save product order.",
        })
      }
    }
  }

  const handleDelete = async (id: string) => {
    setIsDeleting(true)
    const supabase = createClient()

    const { error } = await supabase.from("products").delete().eq("id", id)

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete product. It may be used in existing invoices.",
      })
    } else {
      toast({
        variant: "success",
        title: "Product deleted",
        description: "The product has been deleted successfully.",
      })
      router.refresh()
    }

    setIsDeleting(false)
  }

  const handleExport = async () => {
    const columns: ExportColumn[] = [
      { key: "name", label: "Product Name" },
      { key: "description", label: "Description" },
      { key: "hsn_code", label: "HSN Code" },
      {
        key: "operators",
        label: "Operator",
        formatter: (val) => (val && typeof val === "object" && "name" in val ? String(val.name) : ""),
      },
      {
        key: "operator_price",
        label: "Operator Price",
        formatter: (val) => Number(val || 0).toFixed(2),
      },
      {
        key: "is_active",
        label: "Active",
        formatter: (val) => (val ? "Yes" : "No"),
      },
    ]

    await exportToCSVAsync(processedProducts, columns, `products-${getTimestamp()}.csv`)
    toast({
      variant: "success",
      title: "Exported",
      description: `${processedProducts.length} product(s) exported to CSV successfully.`,
    })
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-white">
        <p className="text-muted-foreground">No products found. Add your first product to get started.</p>
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
        <DndContext
          id="products-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={isViewOnly ? undefined : handleDragEnd}
        >
          <Table className="text-xs sm:text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px] sm:w-[50px] px-2 sm:px-4 py-2 sm:py-3"></TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3" onClick={() => handleSort('name')}>
                  Name<SortIcon column="name" />
                </TableHead>
                <TableHead className="hidden sm:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3" onClick={() => handleSort('description')}>
                  Description<SortIcon column="description" />
                </TableHead>
                <TableHead className="hidden lg:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3" onClick={() => handleSort('hsn_code')}>
                  HSN Code<SortIcon column="hsn_code" />
                </TableHead>
                <TableHead className="hidden md:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3" onClick={() => handleSort('operator')}>
                  Operator<SortIcon column="operator" />
                </TableHead>
                <TableHead className="hidden lg:table-cell cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3" onClick={() => handleSort('operator_price')}>
                  Operator Price<SortIcon column="operator_price" />
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 px-2 sm:px-4 py-2 sm:py-3" onClick={() => handleSort('is_active')}>
                  Status<SortIcon column="is_active" />
                </TableHead>
                <TableHead className="text-right px-2 sm:px-4 py-2 sm:py-3">
                  {isViewOnly ? "View" : "Actions"}
                </TableHead>
              </TableRow>
              <TableRow>
                <TableHead className="px-2 sm:px-4 py-2"></TableHead>
                <TableHead className="px-2 sm:px-4 py-2">
                  <Input
                    placeholder="Filter..."
                    value={filters.name}
                    onChange={(e) => handleFilterChange('name', e.target.value)}
                    className="h-7 text-xs"
                  />
                </TableHead>
                <TableHead className="hidden sm:table-cell px-2 sm:px-4 py-2">
                  <Input
                    placeholder="Filter..."
                    value={filters.description}
                    onChange={(e) => handleFilterChange('description', e.target.value)}
                    className="h-8"
                  />
                </TableHead>
                <TableHead className="hidden lg:table-cell px-2 sm:px-4 py-2">
                  <Input
                    placeholder="Filter..."
                    value={filters.hsn_code}
                    onChange={(e) => handleFilterChange('hsn_code', e.target.value)}
                    className="h-8"
                  />
                </TableHead>
                <TableHead className="hidden md:table-cell px-2 sm:px-4 py-2">
                  <Input
                    placeholder="Filter..."
                    value={filters.operator}
                    onChange={(e) => handleFilterChange('operator', e.target.value)}
                    className="h-8"
                  />
                </TableHead>
                <TableHead className="hidden lg:table-cell px-2 sm:px-4 py-2">
                  <Input
                    placeholder="Filter..."
                    value={filters.operator_price}
                    onChange={(e) => handleFilterChange('operator_price', e.target.value)}
                    className="h-8"
                  />
                </TableHead>
                <TableHead></TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext
                items={pagination.paginatedItems.map((prod) => prod.id)}
                strategy={verticalListSortingStrategy}
              >
                {pagination.paginatedItems.map((product) => (
                  <SortableProductRow
                    key={product.id}
                    product={product}
                    onDelete={(id) => {
                      setProductToDelete(id)
                      setDeleteDialogOpen(true)
                    }}
                    isViewOnly={isViewOnly}
                  />
                ))}
              </SortableContext>
            </TableBody>
          </Table>
        </DndContext>
      </div>

      <TablePagination
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        itemsPerPage={itemsPerPage}
        onPageChange={pagination.goToPage}
        onItemsPerPageChange={setItemsPerPage}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the product.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => productToDelete && handleDelete(productToDelete)}
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
