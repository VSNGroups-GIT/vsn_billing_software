import { NextRequest, NextResponse } from "next/server";
import { inflateSync } from "zlib";

// Extract text from a PDF buffer by inflating FlateDecode streams
// and collecting all Tj/TJ text segments
function extractTextFromPDF(buffer: Buffer): string {
  const lines: string[] = [];
  let pos = 0;

  while (pos < buffer.length - 10) {
    // Find next stream
    let sIdx = -1;
    const cr = buffer.indexOf(Buffer.from("stream\r\n"), pos);
    const lf = buffer.indexOf(Buffer.from("stream\n"), pos);
    if (cr === -1 && lf === -1) break;
    sIdx = cr === -1 ? lf : lf === -1 ? cr : Math.min(cr, lf);

    const endIdx = buffer.indexOf(Buffer.from("endstream"), sIdx);
    if (endIdx === -1) break;

    const streamStart = sIdx + (buffer[sIdx + 6] === 13 ? 8 : 7);
    const streamData = buffer.slice(streamStart, endIdx);

    try {
      const inflated = inflateSync(streamData).toString("utf8");
      // Extract (text)Tj
      const tjRe = /\(([^)]+)\)Tj/g;
      let m: RegExpExecArray | null;
      while ((m = tjRe.exec(inflated)) !== null) lines.push(m[1]);
      // Extract [(parts)]TJ
      const TJRe = /\[([^\]]+)\]TJ/g;
      while ((m = TJRe.exec(inflated)) !== null) {
        const parts = m[1].match(/\(([^)]+)\)/g);
        if (parts) {
          // Join adjacent text parts (remove kerning numbers between)
          const joined = parts.map((p) => p.slice(1, -1)).join("");
          lines.push(joined);
        }
      }
    } catch {
      // Not a FlateDecode stream — skip
    }

    pos = endIdx + 9;
  }

  return lines.join("\n");
}

function parseInvoiceFields(text: string): {
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: string | null;
  tax_amount: string | null;
  taxable_amount: string | null;
} {
  // Invoice number patterns
  const invNoPatterns = [
    /[Ii]nv(?:oice)?\s*[Nn]o[.:]?\s*([A-Z0-9/-]+)/,
    /[Ii]nvoice\s*#\s*([A-Z0-9/-]+)/,
    /\bIN\d{12,}\b/,
  ];
  let invoice_number: string | null = null;
  for (const pat of invNoPatterns) {
    const m = text.match(pat);
    if (m) {
      invoice_number = m[1] ?? m[0];
      break;
    }
  }

  // Date patterns: dd/mm/yyyy or yyyy-mm-dd
  const datePatterns = [
    /[Ii]nvoice\s*[Dd]ate[:\s]*(\d{2}\/\d{2}\/\d{4})/,
    /[Ii]nvoice\s*[Dd]ate[:\s]*(\d{4}-\d{2}-\d{2})/,
    /[Dd]ate[:\s]+(\d{2}\/\d{2}\/\d{4})/,
  ];
  let invoice_date: string | null = null;
  for (const pat of datePatterns) {
    const m = text.match(pat);
    if (m) {
      // Normalise to ISO format
      const raw = m[1];
      if (raw.includes("/")) {
        const parts = raw.split("/");
        // dd/mm/yyyy → yyyy-mm-dd
        invoice_date = `${parts[2]}-${parts[1]}-${parts[0]}`;
      } else {
        invoice_date = raw;
      }
      break;
    }
  }

  // Total amount — look for "Total Amount(INR)" or "Total Amount" followed by a number
  const totalPatterns = [
    /[Tt]otal\s+[Aa]mount[^0-9]*([0-9,]+(?:\.[0-9]{2})?)/,
    /[Gg]rand\s+[Tt]otal[^0-9]*([0-9,]+(?:\.[0-9]{2})?)/,
    /[Tt]otal\s+INR[^0-9]*([0-9,]+(?:\.[0-9]{2})?)/,
  ];
  let total_amount: string | null = null;
  for (const pat of totalPatterns) {
    const m = text.match(pat);
    if (m) {
      total_amount = m[1].replace(/,/g, "");
      break;
    }
  }

  // Tax amount
  const taxPatterns = [
    /[Tt]otal\s+[Tt]ax[^0-9]*([0-9,]+(?:\.[0-9]{2})?)/,
    /[Tt]ax\s+[Aa]mount[^0-9]*([0-9,]+(?:\.[0-9]{2})?)/,
    /IGST[^0-9]*([0-9,]+(?:\.[0-9]{2})?)/,
  ];
  let tax_amount: string | null = null;
  for (const pat of taxPatterns) {
    const m = text.match(pat);
    if (m) {
      tax_amount = m[1].replace(/,/g, "");
      break;
    }
  }

  // Taxable amount
  const taxablePatterns = [
    /[Tt]axab[l]?e\s+[Aa]mount[^0-9]*([0-9,]+(?:\.[0-9]{2})?)/,
    /[Ss]ub[Tt]otal[^0-9]*([0-9,]+(?:\.[0-9]{2})?)/,
  ];
  let taxable_amount: string | null = null;
  for (const pat of taxablePatterns) {
    const m = text.match(pat);
    if (m) {
      taxable_amount = m[1].replace(/,/g, "");
      break;
    }
  }

  return { invoice_number, invoice_date, total_amount, tax_amount, taxable_amount };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }

    // Limit file size to 10 MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const rawText = extractTextFromPDF(buffer);
    const fields = parseInvoiceFields(rawText);

    return NextResponse.json({ success: true, ...fields });
  } catch {
    return NextResponse.json({ error: "Failed to parse PDF" }, { status: 500 });
  }
}
