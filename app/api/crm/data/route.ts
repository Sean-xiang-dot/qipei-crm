import { NextRequest, NextResponse } from "next/server";
import { crmMcpFetch, crmSessionToken } from "../../../lib/crm-mcp";
import { resolveCrmAccess } from "../../../lib/crm-access";

export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;

type PipelineCursorBundle = {
  opportunities: string | null;
  leads: string | null;
};

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

function limitValue(value: string | null, fallback: number, maximum = 50): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), maximum) : fallback;
}

function emptyPage(limit: number): JsonObject {
  return { records: [], count: 0, pagination: { limit, hasMore: false, nextCursor: null } };
}

function nextCursor(value: unknown): string | null {
  const pagination = objectValue(objectValue(value).pagination);
  return typeof pagination.nextCursor === "string" && pagination.nextCursor ? pagination.nextCursor : null;
}

function encodePipelineCursor(value: PipelineCursorBundle): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodePipelineCursor(value: string): PipelineCursorBundle {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<PipelineCursorBundle>;
    if (!parsed || !("opportunities" in parsed) || !("leads" in parsed)) throw new Error("invalid cursor");
    if (parsed.opportunities !== null && typeof parsed.opportunities !== "string") throw new Error("invalid cursor");
    if (parsed.leads !== null && typeof parsed.leads !== "string") throw new Error("invalid cursor");
    return parsed as PipelineCursorBundle;
  } catch {
    throw new Error("商机看板分页游标无效，请重新加载第一页");
  }
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
  const keyword = (request.nextUrl.searchParams.get("keyword") || "").trim().slice(0, 80);
  const keywordQuery = keyword ? `&keyword=${encodeURIComponent(keyword)}` : "";
  const limit = limitValue(request.nextUrl.searchParams.get("limit"), 20);

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
      const customers = await upstreamJson(`/api/customers?${scopeQuery}&limit=${limit}${keywordQuery}${cursorQuery}`, token);
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
      // The original MCP pipeline endpoint performs opportunities, customers and leads in
      // sequence. For large owner pools that makes the first visible page wait for unrelated
      // customer rows. Read only the two board objects in parallel, then hydrate customers
      // referenced by this opportunity page.
      const decodedCursor = cursor ? decodePipelineCursor(cursor) : undefined;
      const [opportunities, leads] = await Promise.all([
        decodedCursor?.opportunities === null
          ? Promise.resolve(emptyPage(limit))
          : upstreamJson(`/api/opportunities?${scopeQuery}&limit=${limit}&includeStageDictionary=1${keywordQuery}${decodedCursor?.opportunities ? `&cursor=${encodeURIComponent(decodedCursor.opportunities)}` : ""}`, token),
        decodedCursor?.leads === null
          ? Promise.resolve(emptyPage(limit))
          : upstreamJson(`/api/leads?${scopeQuery}&limit=${limit}${keywordQuery}${decodedCursor?.leads ? `&cursor=${encodeURIComponent(decodedCursor.leads)}` : ""}`, token),
      ]);
      const stageDictionary = objectValue(opportunities.stageDictionary);
      const opportunityRecords = Array.isArray(opportunities.records) ? opportunities.records as Array<Record<string, unknown>> : [];
      const opportunityIds = opportunityRecords.map(record => String(record.id || "")).filter(Boolean);
      const accountIds = [...new Set(opportunityRecords.map(record => String(record.accountId || "")).filter(Boolean))].slice(0, 100);
      const [customers, opportunityLifecycle, owners] = await Promise.all([
        accountIds.length
          ? upstreamJson(`/api/customers?accountIds=${encodeURIComponent(accountIds.join(","))}&limit=100`, token)
          : Promise.resolve(emptyPage(limit)),
        opportunityIds.length
          ? upstreamJson(`/api/opportunity-lifecycle?opportunityIds=${encodeURIComponent(opportunityIds.join(","))}`, token)
              .catch((error) => ({ records: {}, warning: error instanceof Error ? error.message : "生命周期扩展状态暂时不可用" }))
          : Promise.resolve({ records: {} }),
        ownerDirectory(token, opportunities, leads),
      ]);
      const nextBundle: PipelineCursorBundle = {
        opportunities: nextCursor(opportunities),
        leads: nextCursor(leads),
      };
      const hasMore = Boolean(nextBundle.opportunities || nextBundle.leads);
      return NextResponse.json({
        source: "enterprise-training-mcp",
        asOf: new Date().toISOString(),
        user: whoami,
        access: accessPayload,
        owners,
        opportunities,
        customers,
        stageDictionary,
        leads,
        opportunityLifecycle,
        pagination: { limit, hasMore, nextCursor: hasMore ? encodePipelineCursor(nextBundle) : null },
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
      const opportunities = await upstreamJson(`/api/opportunities?${scopeQuery}&from=${from}&to=${to}&dateField=closeDate&limit=${limit}${keywordQuery}${cursorQuery}`, token);
      const accountIds = [...new Set(recordsValue(opportunities).map((record) => String(record.accountId || "")).filter(Boolean))].slice(0, 100);
      const [customers, owners] = await Promise.all([
        accountIds.length
          ? upstreamJson(`/api/customers?accountIds=${encodeURIComponent(accountIds.join(","))}&limit=100`, token)
          : Promise.resolve(emptyPage(limit)),
        ownerDirectory(token, opportunities),
      ]);
      return NextResponse.json({ source: "enterprise-training-mcp", asOf: new Date().toISOString(), period: { from, to }, user: whoami, access: accessPayload, owners, opportunities, customers });
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
