export type DataScope = "mine" | "team" | "organization";
export type CrmRole = "member" | "sales" | "manager" | "director" | "operations" | "finance" | "admin";

type JsonObject = Record<string, unknown>;

export interface CrmAccess {
  role: CrmRole;
  requested: DataScope;
  effective: DataScope;
  query: string;
  departmentId: string;
  evidence: string[];
  authorizationSource: "xiaoshouyi-oauth+enterprise-boundary";
}

const ADMIN_MARKERS = ["CRM管理员", "销售易管理员", "系统管理员", "信息化管理员", "超级管理员"];
const FINANCE_MARKERS = ["财务BP", "财务业务伙伴", "业务财务", "企培财务", "财务负责人"];
const OPERATIONS_MARKERS = ["销售运营", "业务运营", "营销运营", "企培运营", "运营管理", "运营负责人"];
const DIRECTOR_MARKERS = ["事业部负责人", "企培负责人", "企业培训负责人", "事业部总经理"];
const MANAGER_MARKERS = [
  ...DIRECTOR_MARKERS,
  "团队负责人", "部门负责人", "销售负责人", "业务负责人", "区域负责人",
  "销售主管", "业务主管", "团队主管", "组长", "城市经理", "区域经理", "销售总监",
];
const SALES_MARKERS = ["销售", "客户经理", "商务经理", "渠道经理", "咨询顾问"];

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function stringValues(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  return [String(value).trim()].filter(Boolean);
}

function identityFacts(whoami: JsonObject): string[] {
  const identity = objectValue(whoami.identity);
  const facts = Array.isArray(identity.accessFacts) ? identity.accessFacts : [];
  return [...new Set(facts.flatMap((fact) => {
    const item = objectValue(fact);
    const dimension = String(item.dimension || "");
    if (dimension !== "role" && dimension !== "function" && dimension !== "position") return [];
    return stringValues(item.value);
  }))];
}

function ownerIdFromWhoami(whoami: JsonObject): string {
  const user = objectValue(whoami.user);
  const context = objectValue(whoami.userContext);
  const identity = objectValue(whoami.identity);
  return String(identity.userId || whoami.userId || whoami.id || user.id || context.userId || "");
}

function departmentIdFromWhoami(whoami: JsonObject): string {
  const context = objectValue(whoami.userContext);
  const identity = objectValue(whoami.identity);
  return String(identity.departmentId || context.dimDepart || "");
}

function crmRole(facts: string[]): CrmRole {
  const text = facts.join(" ").replace(/\s+/g, "");
  if (ADMIN_MARKERS.some((marker) => text.includes(marker))) return "admin";
  if (FINANCE_MARKERS.some((marker) => text.includes(marker))) return "finance";
  if (OPERATIONS_MARKERS.some((marker) => text.includes(marker))) return "operations";
  if (DIRECTOR_MARKERS.some((marker) => text.includes(marker))) return "director";
  if (MANAGER_MARKERS.some((marker) => text.includes(marker))) return "manager";
  if (SALES_MARKERS.some((marker) => text.includes(marker))) return "sales";
  return "member";
}

export function resolveCrmAccess(whoami: JsonObject, requested: string): CrmAccess {
  const ownerId = ownerIdFromWhoami(whoami);
  const departmentId = departmentIdFromWhoami(whoami);
  const evidence = identityFacts(whoami);
  const role = crmRole(evidence);
  const requestedScope: DataScope = requested === "team" || requested === "organization" ? requested : "mine";
  // 页面不再根据中文岗位名称复制一套销售易权限。最终可见记录始终由当前
  // 销售易 OAuth 身份决定，MCP 再叠加企培部门与业务类型边界。
  const effective: DataScope = requestedScope;
  if (effective === "team" && !departmentId) throw new Error("当前 CRM 用户缺少部门信息，暂时不能读取团队范围");
  const query = effective === "mine"
    ? `ownerId=${encodeURIComponent(ownerId)}`
    : effective === "team"
      ? `departmentId=${encodeURIComponent(departmentId)}&includeDescendants=1`
      : "includeDescendants=1&scopeProfile=all";
  return {
    role,
    requested: requestedScope,
    effective,
    query,
    departmentId,
    evidence,
    authorizationSource: "xiaoshouyi-oauth+enterprise-boundary",
  };
}
