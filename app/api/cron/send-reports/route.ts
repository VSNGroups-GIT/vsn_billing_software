import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// This endpoint will be called by a cron job (Vercel Cron or external service)
// Protect it with an authorization token
export async function GET(request: Request) {
  try {
    // Verify authorization
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET || "your-secret-key";

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get("type"); // daily, weekly, monthly, semi-annual, annual

    if (reportType === "daily") {
      // Daily report: send to super admin only
      const result = await generateAndSendDailyReport();
      return NextResponse.json({ message: "Daily report processed", result });
    }

    // Get all organizations with automated reports enabled (existing weekly/monthly/annual flow)
    const { data: organizations } = await supabase
      .from("organizations")
      .select("*")
      .eq("automated_reports_enabled", true);

    if (!organizations || organizations.length === 0) {
      return NextResponse.json({
        message: "No organizations with automated reports enabled",
      });
    }

    const results = [];

    for (const org of organizations) {
      // Check if this report type is enabled for this organization
      const reportSettings = org.automated_report_settings || {};

      if (!reportSettings[reportType || "weekly"]) {
        continue;
      }

      // Generate and send report
      const result = await generateAndSendReport(
        org.id,
        reportType || "weekly",
        org.report_email || org.email,
      );
      results.push({ organization: org.name, result });
    }

    return NextResponse.json({
      message: "Reports processed",
      results,
      count: results.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send reports",
      },
      { status: 500 },
    );
  }
}

// ─── Daily report: replicates the Reports page content ───────────────────────

async function generateAndSendDailyReport() {
  const adminClient = createAdminClient();

  // Find the super_admin profile
  const { data: superAdminProfile, error: superAdminError } = await adminClient
    .from("profiles")
    .select("id, organization_id")
    .eq("role", "super_admin")
    .limit(1)
    .single();

  if (!superAdminProfile) {
    return superAdminError?.message || "no super_admin found";
  }

  // Get super admin email from auth.users
  const { data: userData } = await adminClient.auth.admin.getUserById(
    superAdminProfile.id,
  );
  const superAdminEmail = userData?.user?.email;

  if (!superAdminEmail) {
    return "super_admin email not found";
  }

  // Check if daily reports are enabled for the organization
  const { data: org } = await adminClient
    .from("organizations")
    .select("automated_reports_enabled, automated_report_settings")
    .eq("id", superAdminProfile.organization_id)
    .single();

  if (
    !org?.automated_reports_enabled ||
    !org?.automated_report_settings?.daily
  ) {
    return "daily reports not enabled";
  }

  // Build current month date range (same as reports page default)
  const today = new Date();
  const reportYear = today.getFullYear();
  const reportMonth = today.getMonth() + 1;
  const monthStart = `${reportYear}-${String(reportMonth).padStart(2, "0")}-01`;
  const daysInMonth = new Date(reportYear, reportMonth, 0).getDate();
  const monthEnd = `${reportYear}-${String(reportMonth).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const monthLabel = today.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  // Fetch data in parallel (mirrors reports page queries, scoped to organization)
  const [
    clientsResult,
    currentMonthInvoicesResult,
    allUnpaidInvoicesResult,
    currentMonthPaymentsResult,
  ] = await Promise.all([
    adminClient
      .from("clients")
      .select("id, name")
      .eq("organization_id", superAdminProfile.organization_id)
      .order("name", { ascending: true }),

    adminClient
      .from("invoices")
      .select("id, client_id, total_amount, invoice_items(quantity)")
      .eq("organization_id", superAdminProfile.organization_id)
      .gte("issue_date", monthStart)
      .lte("issue_date", monthEnd),

    adminClient
      .from("invoices")
      .select("client_id, total_amount, amount_paid, issue_date")
      .eq("organization_id", superAdminProfile.organization_id)
      .neq("status", "cancelled")
      .neq("status", "paid"),

    adminClient
      .from("payments")
      .select("amount, invoices(client_id)")
      .eq("organization_id", superAdminProfile.organization_id)
      .gte("payment_date", monthStart)
      .lte("payment_date", monthEnd),
  ]);

  const clients = clientsResult.data || [];
  const currentMonthInvoices = currentMonthInvoicesResult.data || [];
  const allUnpaidInvoices = allUnpaidInvoicesResult.data || [];
  const currentMonthPayments = currentMonthPaymentsResult.data || [];

  // Build per-client rows (mirrors reports page logic)
  type ClientRow = {
    id: string;
    name: string;
    sale: number;
    saleKgs: number;
    payments: number;
    outstanding: number;
    oldBal: number;
  };

  const clientMap = new Map<string, ClientRow>();
  for (const client of clients) {
    clientMap.set(client.id, {
      id: client.id,
      name: client.name,
      sale: 0,
      saleKgs: 0,
      payments: 0,
      outstanding: 0,
      oldBal: 0,
    });
  }

  for (const invoice of currentMonthInvoices) {
    const row = clientMap.get(invoice.client_id);
    if (!row) continue;
    row.sale += Number(invoice.total_amount);
    const items =
      (invoice.invoice_items as
        | { quantity: string | number | null }[]
        | null) ?? [];
    row.saleKgs += items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );
  }

  for (const invoice of allUnpaidInvoices) {
    const balance = Number(invoice.total_amount) - Number(invoice.amount_paid);
    if (balance <= 0) continue;
    const row = clientMap.get(invoice.client_id);
    if (!row) continue;
    row.outstanding += balance;
    if (invoice.issue_date < monthStart) {
      row.oldBal += balance;
    }
  }

  for (const payment of currentMonthPayments) {
    const clientId = (
      payment.invoices as unknown as { client_id: string } | null
    )?.client_id;
    if (!clientId) continue;
    const row = clientMap.get(clientId);
    if (!row) continue;
    row.payments += Number(payment.amount);
  }

  const rows = Array.from(clientMap.values()).filter(
    (r) => r.sale > 0 || r.payments > 0 || r.outstanding > 0 || r.oldBal > 0,
  );

  const totals = rows.reduce(
    (acc, r) => ({
      oldBal: acc.oldBal + r.oldBal,
      sale: acc.sale + r.sale,
      saleKgs: acc.saleKgs + r.saleKgs,
      payments: acc.payments + r.payments,
      outstanding: acc.outstanding + r.outstanding,
    }),
    { oldBal: 0, sale: 0, saleKgs: 0, payments: 0, outstanding: 0 },
  );

  const html = generateDailyReportHtml({
    monthLabel,
    daysInMonth,
    rows,
    totals,
    generatedAt: today,
  });

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/email/send-report`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: superAdminEmail,
        subject: `Daily Report – ${monthLabel} (as of ${today.toLocaleDateString("en-IN")})`,
        html,
      }),
    },
  );

  return response.ok ? "sent" : "failed";
}

// ─── Existing report types (weekly / monthly / semi-annual / annual) ──────────

async function generateAndSendReport(
  organizationId: string,
  reportType: string,
  email: string,
) {
  const supabase = await createClient();

  // Calculate date range based on report type
  const dateRange = getDateRangeForReportType(reportType);

  // Fetch data for the period
  const [invoicesResult, paymentsResult] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, clients(name)")
      .eq("organization_id", organizationId)
      .gte("issue_date", dateRange.start)
      .lte("issue_date", dateRange.end),
    supabase
      .from("payments")
      .select("*")
      .eq("organization_id", organizationId)
      .gte("payment_date", dateRange.start)
      .lte("payment_date", dateRange.end),
  ]);

  const invoices = invoicesResult.data || [];
  const payments = paymentsResult.data || [];

  // Calculate metrics
  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalInvoiced = invoices.reduce(
    (sum, inv) => sum + Number(inv.total_amount),
    0,
  );
  const totalOutstanding = invoices.reduce(
    (sum, inv) => sum + (Number(inv.total_amount) - Number(inv.amount_paid)),
    0,
  );
  const paidInvoices = invoices.filter((inv) => inv.status === "paid").length;
  const pendingInvoices = invoices.length - paidInvoices;

  // Send email with report
  const reportHtml = generateReportHtml({
    reportType,
    period: dateRange.label,
    metrics: {
      totalInvoices: invoices.length,
      paidInvoices,
      pendingInvoices,
      totalInvoiced,
      totalRevenue,
      totalOutstanding,
    },
  });

  // Send via email service
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/email/send-report`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report - ${dateRange.label}`,
        html: reportHtml,
      }),
    },
  );

  return response.ok ? "sent" : "failed";
}

function getDateRangeForReportType(reportType: string) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  switch (reportType) {
    case "weekly": {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return {
        start: weekAgo.toISOString().split("T")[0],
        end: today.toISOString().split("T")[0],
        label: `Last 7 days`,
      };
    }
    case "monthly": {
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return {
        start: monthAgo.toISOString().split("T")[0],
        end: today.toISOString().split("T")[0],
        label: `Last 30 days`,
      };
    }
    case "semi-annual": {
      const sixMonthsAgo = new Date(today);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      return {
        start: sixMonthsAgo.toISOString().split("T")[0],
        end: today.toISOString().split("T")[0],
        label: `Last 6 months`,
      };
    }
    case "annual": {
      // Financial year
      const startYear = month < 3 ? year - 1 : year;
      return {
        start: `${startYear}-04-01`,
        end: `${startYear + 1}-03-31`,
        label: `FY ${startYear}-${startYear + 1}`,
      };
    }
    default:
      return {
        start: today.toISOString().split("T")[0],
        end: today.toISOString().split("T")[0],
        label: "Today",
      };
  }
}

// ─── Email templates ──────────────────────────────────────────────────────────

function generateDailyReportHtml(data: {
  monthLabel: string;
  daysInMonth: number;
  rows: {
    id: string;
    name: string;
    sale: number;
    saleKgs: number;
    payments: number;
    outstanding: number;
    oldBal: number;
  }[];
  totals: {
    oldBal: number;
    sale: number;
    saleKgs: number;
    payments: number;
    outstanding: number;
  };
  generatedAt: Date;
}) {
  const { monthLabel, daysInMonth, rows, totals, generatedAt } = data;
  const fmt = (n: number) =>
    n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const rowsHtml =
    rows.length === 0
      ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:#6b7280;">No activity found for ${monthLabel}.</td></tr>`
      : rows
          .map(
            (r) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:500;">${r.name}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.oldBal > 0 ? `₹${fmt(r.oldBal)}` : "—"}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.sale > 0 ? `₹${fmt(r.sale)}` : "—"}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.saleKgs > 0 ? r.saleKgs.toFixed(2) : "—"}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.saleKgs > 0 ? `${(r.saleKgs / daysInMonth).toFixed(2)}` : "—"}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#15803d;">${r.payments > 0 ? `₹${fmt(r.payments)}` : "—"}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#c2410c;font-weight:600;">${r.outstanding > 0 ? `₹${fmt(r.outstanding)}` : "—"}</td>
        </tr>
      `,
          )
          .join("");

  const totalsHtml =
    rows.length > 0
      ? `
    <tr style="background:#f3f4f6;font-weight:bold;border-top:2px solid #d1d5db;">
      <td style="padding:10px 12px;">Total Sale</td>
      <td style="padding:10px 12px;text-align:right;">₹${fmt(totals.oldBal)}</td>
      <td style="padding:10px 12px;text-align:right;">₹${fmt(totals.sale)}</td>
      <td style="padding:10px 12px;text-align:right;">${totals.saleKgs > 0 ? totals.saleKgs.toFixed(2) : "0"}</td>
      <td style="padding:10px 12px;text-align:right;">—</td>
      <td style="padding:10px 12px;text-align:right;color:#15803d;">₹${fmt(totals.payments)}</td>
      <td style="padding:10px 12px;text-align:right;color:#c2410c;">₹${fmt(totals.outstanding)}</td>
    </tr>
  `
      : "";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
    </head>
    <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background:#f9fafb;">
      <div style="max-width:760px;margin:0 auto;padding:16px;">
        <div style="background:#1e40af;color:white;padding:20px 16px;text-align:center;border-radius:8px 8px 0 0;">
          <h1 style="margin:0 0 4px;">Daily Business Report</h1>
          <p style="margin:0;opacity:0.9;">Monthly Report: ${monthLabel}</p>
        </div>

        <div style="background:white;padding:12px 8px 16px;border-radius:0 0 8px 8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <div style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;">
          <table style="width:760px;border-collapse:collapse;font-size:11px;table-layout:fixed;">
            <thead>
              <tr style="background:#1e40af;color:white;">
                <th style="padding:10px 12px;text-align:left;">Clients</th>
                <th style="padding:10px 12px;text-align:right;">Old balance</th>
                <th style="padding:10px 12px;text-align:right;">Sale</th>
                <th style="padding:10px 12px;text-align:right;">Sale in KG</th>
                <th style="padding:10px 12px;text-align:right;">Average quantity / Day</th>
                <th style="padding:10px 12px;text-align:right;">Payments</th>
                <th style="padding:10px 12px;text-align:right;">Outstanding</th>
              </tr>
              <tr style="background:#eff6ff;color:#6b7280;font-size:11px;font-weight:normal;">
                <th style="padding:6px 12px;text-align:left;font-weight:normal;"></th>
                <th style="padding:6px 12px;text-align:right;font-weight:normal;">Outstanding − Current month Sale</th>
                <th style="padding:6px 12px;text-align:right;font-weight:normal;">Current Month Sale</th>
                <th style="padding:6px 12px;text-align:right;font-weight:normal;">Total Purchased Qty</th>
                <th style="padding:6px 12px;text-align:right;font-weight:normal;">Total / ${daysInMonth} days</th>
                <th style="padding:6px 12px;text-align:right;font-weight:normal;">Current Month Payments</th>
                <th style="padding:6px 12px;text-align:right;font-weight:normal;">Total Outstanding</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              ${totalsHtml}
            </tbody>
          </table>
          </div>

          <p style="margin-top:24px;text-align:center;color:#9ca3af;font-size:12px;">
            This is an automated daily report from your Billing Management System.<br/>
            Generated on ${generatedAt.toLocaleString("en-IN")}
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateReportHtml(data: {
  reportType: string;
  period: string;
  metrics: {
    totalInvoices: number;
    paidInvoices: number;
    pendingInvoices: number;
    totalInvoiced: number;
    totalRevenue: number;
    totalOutstanding: number;
  };
}) {
  const { period, metrics } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1e40af; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .metric-card { background: white; padding: 20px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .metric-label { color: #6b7280; font-size: 14px; margin-bottom: 5px; }
        .metric-value { font-size: 28px; font-weight: bold; color: #1e40af; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Automated Business Report</h1>
          <p>${period}</p>
        </div>
        <div class="content">
          <h2 style="margin-top: 0;">Financial Summary</h2>

          <div class="metric-card">
            <div class="metric-label">Total Revenue</div>
            <div class="metric-value">₹${metrics.totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>

          <div class="grid">
            <div class="metric-card">
              <div class="metric-label">Total Invoiced</div>
              <div class="metric-value" style="font-size: 20px;">₹${metrics.totalInvoiced.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>

            <div class="metric-card">
              <div class="metric-label">Outstanding</div>
              <div class="metric-value" style="font-size: 20px; color: #dc2626;">₹${metrics.totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          <h3>Invoice Statistics</h3>
          <div class="grid">
            <div class="metric-card">
              <div class="metric-label">Total Invoices</div>
              <div class="metric-value" style="font-size: 20px;">${metrics.totalInvoices}</div>
            </div>

            <div class="metric-card">
              <div class="metric-label">Paid Invoices</div>
              <div class="metric-value" style="font-size: 20px; color: #16a34a;">${metrics.paidInvoices}</div>
            </div>

            <div class="metric-card">
              <div class="metric-label">Pending Invoices</div>
              <div class="metric-value" style="font-size: 20px; color: #ea580c;">${metrics.pendingInvoices}</div>
            </div>
          </div>

          <div class="footer">
            <p>This is an automated report from your Billing Management System.</p>
            <p>Generated on ${new Date().toLocaleString("en-IN")}</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}
