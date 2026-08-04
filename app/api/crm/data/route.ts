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
      const [customers, opportunities, summary, activities] = await Promise.all([
        upstreamJson(`/api/customers?${ownerQuery}&limit=100`, token),
        upstreamJson(`/api/opportunities?${ownerQuery}&from=${from}&to=${to}&dateField=updatedAt&limit=100`, token),
        upstreamJson(`/api/dashboard/sales-summary?${ownerQuery}&from=${from}&to=${to}`, token),
        upstreamJson(`/api/activities?${ownerQuery}&from=${from}&to=${to}&limit=200`, token),
      ]);
      return NextResponse.json({
        source: "enterprise-training-mcp",
        asOf: new Date().toISOString(),
        period: { from, to },
        customers,
        opportunities,
        summary,
        activities,
        coverage: {
          customerForm: "real",
          revenue: "real",
          activityQuality: "real",
          productCombination: "needs-order-line-aggregation",
          experienceStageConversion: "needs-stage-dictionary",
        },
      });
    }

    return NextResponse.json({ error: "不支持的数据视图" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CRM 数据查询失败" }, { status: 502 });
  }
}
