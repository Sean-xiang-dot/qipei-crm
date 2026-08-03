import { cookies } from "next/headers";

export const CRM_SESSION_COOKIE = "chengming_crm_session";

const DEFAULT_MCP_URL = "https://enterprise-training-mcp.coolify.eeo-inc.com";

export function crmMcpBaseUrl(): string {
  const configured = process.env.ENTERPRISE_TRAINING_MCP_URL?.trim() || DEFAULT_MCP_URL;
  return configured.replace(/\/+$/, "");
}

export async function crmSessionToken(): Promise<string | null> {
  return (await cookies()).get(CRM_SESSION_COOKIE)?.value ?? null;
}

export async function crmMcpFetch(path: string, init: RequestInit = {}, token?: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (token) headers.set("X-Enterprise-Training-Session-Token", token);
  return fetch(`${crmMcpBaseUrl()}${path}`, { ...init, headers, cache: "no-store" });
}

export const crmSessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
