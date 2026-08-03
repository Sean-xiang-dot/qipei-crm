import { NextResponse } from "next/server";
import { crmMcpFetch } from "../../../lib/crm-mcp";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const upstream = await crmMcpFetch("/auth/login");
    const data = await upstream.json();
    if (!upstream.ok) return NextResponse.json({ error: data.error || "无法启动 CRM 登录" }, { status: upstream.status });
    return NextResponse.json({ loginId: data.loginId, authorizeUrl: data.authorizeUrl, expiresAt: data.expiresAt });
  } catch {
    return NextResponse.json({ error: "企培 CRM MCP 暂时不可用" }, { status: 502 });
  }
}
