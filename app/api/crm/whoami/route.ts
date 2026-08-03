import { NextResponse } from "next/server";
import { crmMcpFetch, crmSessionToken } from "../../../lib/crm-mcp";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await crmSessionToken();
  if (!token) return NextResponse.json({ error: "未登录 CRM" }, { status: 401 });
  const upstream = await crmMcpFetch("/api/whoami", {}, token);
  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
