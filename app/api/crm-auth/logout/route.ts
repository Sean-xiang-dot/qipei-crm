import { NextResponse } from "next/server";
import { CRM_SESSION_COOKIE, crmMcpFetch, crmSessionCookieOptions, crmSessionToken } from "../../../lib/crm-mcp";

export async function POST() {
  const token = await crmSessionToken();
  if (token) {
    try { await crmMcpFetch("/auth/logout", { method: "POST" }, token); } catch { /* local session is still cleared */ }
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(CRM_SESSION_COOKIE, "", { ...crmSessionCookieOptions, maxAge: 0 });
  return response;
}
