import { NextRequest, NextResponse } from "next/server";
import { crmMcpFetch, crmSessionToken } from "../../../lib/crm-mcp";

export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function shanghaiDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function startOfQuarter(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1));
}

function endOfQuarter(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3 + 3, 0));
}

async function upstreamJson(path: string, token: string): Promise<JsonObject> {
  const response = await crmMcpFetch(path, {}, token);
  const data = objectValue(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `${path} 查询失败`);
  return data;
}

async function upstreamPost(path: string, body: JsonObject, token: string): Promise<JsonObject> {
  const response = await crmMcpFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, token);
  const data = objectValue(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `${path} 查询失败`);
  return data;
}

function ownerIdFromWhoami(data: JsonObject): string {
  const user = objectValue(data.user);
  const context = objectValue(data.userContext);
  return String(data.userId || data.id || user.id || context.userId || "");
}

export async function GET(request: NextRequest) {
  const token = await crmSessionToken();
  if (!token) return NextResponse.json({ error: "未登录 CRM" }, { status: 401 });

  const view = request.nextUrl.searchParams.get("view") || "customers";
  const period = request.nextUrl.searchParams.get("period") || "30d";

  try {
    const whoami = await upstreamJson("/api/whoami", token);
    const ownerId = ownerIdFromWhoami(whoami);
    if (!ownerId) throw new Error("无法取得当前 CRM 用户 ID");
    const ownerQuery = `ownerId=${encodeURIComponent(ownerId)}`;

    if (view === "customers") {
      const customers = await upstreamJson(`/api/customers?${ownerQuery}&limit=100`, token);
      return NextResponse.json({ source: "enterprise-training-mcp", asOf: new Date().toISOString(), user: whoami, userName: String(whoami.user || "当前用户"), customers });
    }

    if (view === "tasks") {
      const tasks = await upstreamJson(`/api/weekly-actions?${ownerQuery}`, token);
      return NextResponse.json({
        source: "enterprise-training-mcp",
        asOf: new Date().toISOString(),
        user: whoami,
        tasks,
      });
    }

    if (view === "pipeline") {
      const [opportunities, customers, stageDictionary, leads] = await Promise.all([
        upstreamJson(`/api/opportunities?${ownerQuery}&limit=100`, token),
        upstreamJson(`/api/customers?${ownerQuery}&limit=100`, token),
        upstreamJson("/api/metadata/opportunity-stages", token),
        upstreamPost("/api/soql", {
          soql: `SELECT id,name,companyName,mobile,ownerId,createdAt,updatedAt FROM lead WHERE ownerId = ${ownerId} ORDER BY updatedAt DESC LIMIT 100`,
        }, token).catch((error) => ({ records: [], warning: error instanceof Error ? error.message : "潜客查询失败" })),
      ]);
      return NextResponse.json({
        source: "enterprise-training-mcp",
        asOf: new Date().toISOString(),
        user: whoami,
        opportunities,
        customers,
        stageDictionary,
        leads,
      });
    }

    if (view === "activities") {
      const now = new Date();
      const to = shanghaiDate(now);
      const from = shanghaiDate(new Date(now.getTime() - 90 * 86400000));
      const activities = await upstreamJson(`/api/activities?${ownerQuery}&from=${from}&to=${to}&limit=100`, token);
      return NextResponse.json({ source: "enterprise-training-mcp", asOf: new Date().toISOString(), period: { from, to }, activities });
    }

    if (view === "forecast") {
      const now = new Date();
      const from = shanghaiDate(now);
      const toDate = period === "quarter" ? endOfQuarter(now) : new Date(now.getTime() + 30 * 86400000);
      const to = shanghaiDate(toDate);
      const [opportunities, customers] = await Promise.all([
        upstreamJson(`/api/opportunities?${ownerQuery}&from=${from}&to=${to}&dateField=closeDate&limit=100`, token),
        upstreamJson(`/api/customers?${ownerQuery}&limit=100`, token),
      ]);
      return NextResponse.json({ source: "enterprise-training-mcp", asOf: new Date().toISOString(), period: { from, to }, opportunities, customers });
    }

    if (view === "insights") {
      const now = new Date();
      const to = shanghaiDate(now);
      const fromDate = period === "quarter" ? startOfQuarter(now) : new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
      const from = shanghaiDate(fromDate);
      const [customers, opportunities, summary, activities, productMix, stageDictionary, experienceFunnel] = await Promise.all([
        upstreamJson(`/api/customers?${ownerQuery}&limit=100`, token),
        upstreamJson(`/api/opportunities?${ownerQuery}&from=${from}&to=${to}&dateField=updatedAt&limit=100`, token),
        upstreamJson(`/api/dashboard/sales-summary?${ownerQuery}&from=${from}&to=${to}`, token),
        upstreamJson(`/api/activities?${ownerQuery}&from=${from}&to=${to}&limit=200`, token),
        upstreamJson(`/api/dashboard/customer-product-mix?${ownerQuery}&from=${from}&to=${to}`, token),
        upstreamJson("/api/metadata/opportunity-stages", token),
        upstreamJson(`/api/dashboard/experience-funnel?${ownerQuery}&from=${from}&to=${to}`, token),
      ]);
      return NextResponse.json({
        source: "enterprise-training-mcp",
        asOf: new Date().toISOString(),
        period: { from, to },
        customers,
        opportunities,
        summary,
        activities,
        productMix,
        stageDictionary,
        experienceFunnel,
        coverage: {
          customerForm: "real",
          revenue: "real",
          activityQuality: "real",
          productCombination: "real-order-line-aggregation",
          experienceStageConversion: "snapshot-only-no-stage-history",
        },
      });
    }

    return NextResponse.json({ error: "不支持的数据视图" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CRM 数据查询失败" }, { status: 502 });
  }
}
