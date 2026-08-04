import { NextRequest, NextResponse } from "next/server";
import { crmMcpFetch, crmSessionToken } from "../../../lib/crm-mcp";

export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

async function forward(path: string, method: "POST" | "PATCH", body: JsonObject, token: string) {
  const response = await crmMcpFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, token);
  const data = objectValue(await response.json().catch(() => ({})));
  if (!response.ok) {
    return NextResponse.json({ error: String(data.error || `${path} 写入失败`) }, { status: response.status });
  }
  return NextResponse.json({ source: "enterprise-training-mcp", ...data });
}

export async function POST(request: NextRequest) {
  const token = await crmSessionToken();
  if (!token) return NextResponse.json({ error: "未登录 CRM" }, { status: 401 });

  const body = objectValue(await request.json().catch(() => ({})));
  const action = String(body.action || "");

  if (action === "customer-lifecycle") {
    return forward("/api/customer-lifecycle/transition", "POST", objectValue(body.payload), token);
  }
  if (action === "create-activity") {
    const payload = objectValue(body.payload);
    return forward("/api/activity", "POST", {
      ...payload,
      entityType: payload.entityType || process.env.CRM_DEFAULT_ACTIVITY_ENTITY_TYPE || "11010011100002",
    }, token);
  }
  if (action === "create-task") {
    return forward("/api/tasks", "POST", objectValue(body.payload), token);
  }
  if (action === "create-opportunity") {
    return forward("/api/opportunities", "POST", objectValue(body.payload), token);
  }
  if (action === "update-opportunity") {
    const payload = objectValue(body.payload);
    const opportunityId = String(payload.opportunityId || "");
    if (!opportunityId) return NextResponse.json({ error: "缺少 opportunityId" }, { status: 400 });
    return forward(`/api/opportunities/${encodeURIComponent(opportunityId)}`, "PATCH", {
      fields: objectValue(payload.fields),
      ...(payload.expectedUpdatedAt !== undefined ? { expectedUpdatedAt: payload.expectedUpdatedAt } : {}),
    }, token);
  }
  if (action === "create-lead") {
    return forward("/api/leads", "POST", objectValue(body.payload), token);
  }
  if (action === "update-record") {
    const payload = objectValue(body.payload);
    const objectApiKey = String(payload.objectApiKey || "");
    const recordId = String(payload.recordId || "");
    if (!objectApiKey || !recordId) return NextResponse.json({ error: "缺少 objectApiKey 或 recordId" }, { status: 400 });
    return forward(`/api/record/${encodeURIComponent(objectApiKey)}/${encodeURIComponent(recordId)}`, "PATCH", { fields: objectValue(payload.fields) }, token);
  }

  return NextResponse.json({ error: "不支持的 CRM 操作" }, { status: 400 });
}
