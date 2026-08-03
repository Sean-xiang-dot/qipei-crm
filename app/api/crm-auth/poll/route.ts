import { NextRequest, NextResponse } from "next/server";
import { CRM_SESSION_COOKIE, crmMcpFetch, crmSessionCookieOptions } from "../../../lib/crm-mcp";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const loginId = request.nextUrl.searchParams.get("loginId") || "";
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(loginId)) return NextResponse.json({ error: "登录请求无效" }, { status: 400 });
  try {
    const upstream = await crmMcpFetch(`/auth/poll?loginId=${encodeURIComponent(loginId)}`);
    const data = await upstream.json();
    if (!upstream.ok) return NextResponse.json({ error: data.error || "CRM 登录失败" }, { status: upstream.status });
    if (data.status !== "authenticated") return NextResponse.json({ status: data.status });

    const response = NextResponse.json({ status: "authenticated", userId: data.userId, userName: data.userName, expiresAt: data.expiresAt });
    response.cookies.set(CRM_SESSION_COOKIE, data.sessionToken, {
      ...crmSessionCookieOptions,
      expires: new Date(data.expiresAt),
    });
    return response;
  } catch {
    return NextResponse.json({ error: "等待 CRM 授权时连接失败" }, { status: 502 });
  }
}
