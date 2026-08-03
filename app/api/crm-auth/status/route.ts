import { NextResponse } from "next/server";
import { CRM_SESSION_COOKIE, crmMcpFetch, crmSessionCookieOptions, crmSessionToken } from "../../../lib/crm-mcp";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await crmSessionToken();
  if (!token) return NextResponse.json({ authenticated: false });
  try {
    const upstream = await crmMcpFetch("/auth/session/status", {}, token);
    const data = await upstream.json();
    const response = NextResponse.json({
      authenticated: Boolean(upstream.ok && data.authenticated),
      session: data.authenticated ? { userId: data.session.userId, userName: data.session.userName, expiresAt: data.session.expiresAt } : null,
    });
    if (!data.authenticated) response.cookies.set(CRM_SESSION_COOKIE, "", { ...crmSessionCookieOptions, maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ authenticated: false, error: "企培 CRM MCP 暂时不可用" }, { status: 502 });
  }
}
