/**
 * Utility functions for exporting data to Excel format
 */

export interface ExportColumn {
  key: string
  label: string
  formatter?: (value: any) => string
}

/**
 * Export data array to CSV format (compatible with Excel)
 * @param data Array of objects to export
 * @param columns Column definitions with keys and labels
 * @param filename Name of the file to download
 */
export function exportToCSV(
  data: any[],
  columns: ExportColumn[],
  filename: string = 'export.csv'
) {
  if (data.length === 0) {
    return
  }

  // Create header row
  const headers = columns.map(col => `"${col.label}"`).join(',')

  // Create data rows
  const rows = data.map(item =>
    columns
      .map(col => {
        let value = item[col.key]
        if (col.formatter) {
          value = col.formatter(value)
        }
        // Escape quotes and wrap in quotes
        const stringValue = String(value ?? '')
        return `"${stringValue.replace(/"/g, '""')}"`
      })
      .join(',')
  )

  // Combine header and rows
  const csv = [headers, ...rows].join('\n')

  // Create blob and download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Export data array to JSON format
 * @param data Array of objects to export
 * @param filename Name of the file to download
 */
export function exportToJSON(
  data: any[],
  filename: string = 'export.json'
) {
  if (data.length === 0) {
    return
  }

  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Get current timestamp for filename
 */
export function getTimestamp(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Export data array to PDF using jsPDF
 */
export async function exportToPDF(
  data: any[],
  columns: ExportColumn[],
  title: string,
  filename: string = 'export.pdf'
) {
  if (data.length === 0) return

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 12
  const usableWidth = pageWidth - margin * 2
  const colWidth = usableWidth / columns.length
  const rowHeight = 7

  let y = 18

  // Title
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(title, margin, y)
  y += 8

  // Header row background
  doc.setFillColor(220, 220, 220)
  doc.rect(margin, y - 5, usableWidth, rowHeight, 'F')

  // Header row text
  doc.setFontSize(8)
  columns.forEach((col, i) => {
    doc.text(col.label, margin + i * colWidth + 2, y)
  })
  y += rowHeight

  // Data rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)

  data.forEach((item, rowIndex) => {
    if (y + rowHeight > pageHeight - margin) {
      doc.addPage()
      y = 18
    }

    if (rowIndex % 2 === 0) {
      doc.setFillColor(248, 248, 248)
      doc.rect(margin, y - 5, usableWidth, rowHeight, 'F')
    }

    columns.forEach((col, i) => {
      let value = item[col.key]
      if (col.formatter) value = col.formatter(value)
      const str = String(value ?? '').substring(0, 38)
      doc.text(str, margin + i * colWidth + 2, y)
    })

    y += rowHeight
  })

  // Bottom border line
  doc.setDrawColor(180, 180, 180)
  doc.line(margin, y, pageWidth - margin, y)

  doc.save(filename)
}
