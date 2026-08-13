import { NextRequest, NextResponse } from "next/server";
import { crmMcpFetch, crmSessionToken } from "../../../lib/crm-mcp";
import { resolveCrmAccess } from "../../../lib/crm-access";

export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function recordsValue(value: unknown): Array<Record<string, unknown>> {
  const object = objectValue(value);
  if (Array.isArray(object.records)) return object.records as Array<Record<string, unknown>>;
  const result = objectValue(object.result);
  if (Array.isArray(result.records)) return result.records as Array<Record<string, unknown>>;
  const data = objectValue(object.data);
  return Array.isArray(data.records) ? data.records as Array<Record<string, unknown>> : [];
}

function queryValue(value: string): string {
  return /^\d+$/.test(value) ? value : `'${value.replace(/'/g, "\\'")}'`;
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await crmMcpFetch(path, {}, token);
    const data = objectValue(await response.json().catch(() => ({})));
    if (response.ok) return data;

    const message = typeof data.error === "string" ? data.error : `${path} 查询失败`;
    const rateLimited = response.status === 429 || /status code 429|too many requests|请求过于频繁/i.test(message);
    if (!rateLimited || attempt === 2) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(`${path} 查询失败`);
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

async function ownerDirectory(token: string, ...datasets: unknown[]): Promise<Record<string, string>> {
  const ownerIds = [...new Set(datasets.flatMap(recordsValue).map((record) => String(record.ownerId || "")).filter(Boolean))].slice(0, 100);
  if (!ownerIds.length) return {};
  const result = await upstreamPost("/api/soql", {
    soql: `SELECT id,name FROM user WHERE id IN (${ownerIds.map(queryValue).join(",")}) LIMIT 100`,
  }, token).catch(() => ({ records: [] }));
  return Object.fromEntries(recordsValue(result).map((record) => [String(record.id), String(record.name || record.id)]));
}

async function withReferencedCustomers(token: string, customers: JsonObject, opportunities: JsonObject): Promise<JsonObject> {
  const current = recordsValue(customers);
  const currentIds = new Set(current.map((record) => String(record.id)));
  const missingIds = [...new Set(recordsValue(opportunities).map((record) => String(record.accountId || "")).filter((id) => id && !currentIds.has(id)))].slice(0, 100);
  if (!missingIds.length) return customers;
  const referenced = await upstreamJson(`/api/customers?accountIds=${encodeURIComponent(missingIds.join(","))}&limit=100`, token);
  return { ...customers, records: [...current, ...recordsValue(referenced)], referencedReadOnlyCount: recordsValue(referenced).length };
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
  const requestedScope = request.nextUrl.searchParams.get("scope") || "organization";
  const cursor = request.nextUrl.searchParams.get("cursor") || "";
  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";

  try {
    const whoami = await upstreamJson("/api/whoami", token);
    const ownerId = ownerIdFromWhoami(whoami);
    if (!ownerId) throw new Error("无法取得当前 CRM 用户 ID");
    const ownerQuery = `ownerId=${encodeURIComponent(ownerId)}`;
    const access = resolveCrmAccess(whoami, requestedScope);
    const scopeQuery = access.query;
    const accessPayload = {
      role: access.role,
      requested: access.requested,
      effective: access.effective,
      canViewTeam: Boolean(access.departmentId),
      canViewOrganization: true,
      authorizationSource: access.authorizationSource,
      evidence: access.evidence,
      identityWarning: typeof whoami.identityWarning === "string" ? whoami.identityWarning : "",
    };

    if (view === "customers") {
      const customers = await upstreamJson(`/api/customers?${scopeQuery}&limit=50${cursorQuery}`, token);
      const owners = await ownerDirectory(token, customers);
      return NextResponse.json({ source: "enterprise-training-mcp", asOf: new Date().toISOString(), user: whoami, userName: String(whoami.user || "当前用户"), access: accessPayload, owners, customers });
    }

    if (view === "tasks") {
      const [realTasks, candidates] = await Promise.all([
        upstreamJson(`/api/tasks?${ownerQuery}&limit=200`, token),
        upstreamJson(`/api/weekly-actions?${ownerQuery}`, token),
      ]);
      return NextResponse.json({
        source: "enterprise-training-mcp",
        asOf: new Date().toISOString(),
        user: whoami,
        realTasks,
        candidates,
      });
    }

    if (view === "pipeline") {
      // Keep the cross-service hop atomic. The MCP performs the scoped CRM reads and returns
      // one coherent pipeline snapshot instead of making the web app burst several requests.
      const pipeline = await upstreamJson(`/api/pipeline?${scopeQuery}&limit=50${cursorQuery}`, token);
      const opportunities = objectValue(pipeline.opportunities);
      const customers = objectValue(pipeline.customers);
      const stageDictionary = objectValue(pipeline.stageDictionary);
      const leads = objectValue(pipeline.leads);
      const scopedCustomers = await withReferencedCustomers(token, customers, opportunities);
      const opportunityRecords = Array.isArray(opportunities.records) ? opportunities.records as Array<Record<string, unknown>> : [];
      const opportunityIds = opportunityRecords.map(record => String(record.id || "")).filter(Boolean);
      let opportunityLifecycle: JsonObject = { records: {} };
      if (opportunityIds.length) {
        try {
          opportunityLifecycle = await upstreamJson(`/api/opportunity-lifecycle?opportunityIds=${encodeURIComponent(opportunityIds.join(","))}`, token);
        } catch (error) {
          // 生命周期是本系统的附加状态，不能反过来阻断销售易中的真实商机展示。
          opportunityLifecycle = {
            records: {},
            warning: error instanceof Error ? error.message : "生命周期扩展状态暂时不可用",
          };
        }
      }
      return NextResponse.json({
        source: "enterprise-training-mcp",
        asOf: new Date().toISOString(),
        user: whoami,
        access: accessPayload,
        owners: await ownerDirectory(token, opportunities, scopedCustomers, leads),
        opportunities,
        customers: scopedCustomers,
        stageDictionary,
        leads,
        opportunityLifecycle,
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
        upstreamJson(`/api/opportunities?${scopeQuery}&from=${from}&to=${to}&dateField=closeDate&limit=50${cursorQuery}`, token),
        upstreamJson(`/api/customers?${scopeQuery}&limit=100`, token),
      ]);
      const scopedCustomers = await withReferencedCustomers(token, customers, opportunities);
      return NextResponse.json({ source: "enterprise-training-mcp", asOf: new Date().toISOString(), period: { from, to }, user: whoami, access: accessPayload, owners: await ownerDirectory(token, opportunities, scopedCustomers), opportunities, customers: scopedCustomers });
    }

    if (view === "insights") {
      const now = new Date();
      const to = shanghaiDate(now);
      const fromDate = period === "quarter" ? startOfQuarter(now) : new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
      const from = shanghaiDate(fromDate);
      const [customers, opportunities, summary, activities, productMix, stageDictionary, experienceFunnel] = await Promise.all([
        upstreamJson(`/api/customers?${scopeQuery}&limit=100`, token),
        upstreamJson(`/api/opportunities?${scopeQuery}&from=${from}&to=${to}&dateField=updatedAt&limit=100`, token),
        upstreamJson(`/api/dashboard/sales-summary?${scopeQuery}&from=${from}&to=${to}`, token),
        upstreamJson(`/api/activities?${ownerQuery}&from=${from}&to=${to}&limit=200`, token),
        upstreamJson(`/api/dashboard/customer-product-mix?${scopeQuery}&from=${from}&to=${to}`, token),
        upstreamJson("/api/metadata/opportunity-stages", token),
        upstreamJson(`/api/dashboard/experience-funnel?${scopeQuery}&from=${from}&to=${to}`, token),
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
