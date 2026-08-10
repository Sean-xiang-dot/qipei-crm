"use client";

import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from "react";

type View = "workbench" | "tasks" | "customers" | "opportunities" | "activities" | "insights";

const navigation: { id: View; label: string; mark: string; badge?: string }[] = [
  { id: "workbench", label: "今日工作台", mark: "今" },
  { id: "tasks", label: "任务中心", mark: "任" },
  { id: "customers", label: "客户", mark: "客" },
  { id: "opportunities", label: "商机", mark: "机" },
  { id: "activities", label: "销售活动", mark: "活" },
  { id: "insights", label: "经营洞察", mark: "析" },
];

type TaskItem = {
  id: string;
  time: string;
  urgency: string;
  customer: string;
  title: string;
  fact: string;
  reason: string;
  source: string;
  ruleId?: string;
  candidateKey?: string;
  owner: string;
  action: string;
  kind?: "real" | "candidate";
  completed?: boolean;
  dueAt?: string | number;
  associationId?: string;
  associationType?: "lead" | "account" | "opportunity";
  statusLabel?: string;
};

type CustomerLifecycle = "new" | "active" | "attention" | "paused" | "closed";

type CustomerItem = {
  id: string;
  name: string;
  form: string;
  city: string;
  owner: string;
  ownedByMe: boolean;
  products: string;
  next: string;
  health: string;
  tone: string;
  lifecycle: CustomerLifecycle;
  lastFact: string;
  lastActiveDays: number;
  pauseReason?: string;
  reviewDate?: string;
  version: number;
  nextTask?: { id?: string; title?: string; dueAt?: string } | null;
};

type ForecastItem = {
  id: string;
  name: string;
  customer: string;
  stage: string;
  amount: number;
  forecastAmount: number;
  evidence: string;
  next: string;
  risk: string;
  closeDate: string;
  owner: string;
  ownedByMe: boolean;
};

type CrmRecord = Record<string, unknown>;
type DataState = "loading" | "real" | "error";
type DataScope = "mine" | "team" | "organization";
type AccessInfo = {
  role: "sales" | "manager" | "director";
  effective: DataScope;
  canViewTeam: boolean;
  canViewOrganization: boolean;
  evidence?: string[];
  identityWarning?: string;
};

type InsightPayload = {
  customers?: { records?: CrmRecord[] };
  opportunities?: { records?: CrmRecord[] };
  activities?: { records?: CrmRecord[] };
  summary?: {
    metrics?: {
      accountsActiveInPeriod?: { count?: number };
      accounts?: { count?: number };
      activityRecords?: { count?: number };
      visitRecords?: { count?: number };
      performance?: { total?: number };
    };
  };
  productMix?: { rows?: Array<{ customerForm?: string; customerCount?: number; onlyDevice?: number; onlyClassIn?: number; combined?: number; performanceAmount?: number }> };
  experienceFunnel?: { snapshotOnly?: boolean; conversionAvailable?: boolean; stages?: Array<{ key?: string; label?: string; opportunityCount?: number; customerCount?: number; conversionFromPrevious?: number | null }> };
  stageDictionary?: { stages?: Array<{ stageId?: string; stageName?: string; normalizedStage?: string; normalizedLabel?: string }> };
};

type AnalysisResult = {
  provider: string;
  facts: Array<{ type: string; value: string; confidence?: number; evidence?: string }>;
  suggestedStage: "interest" | "experience" | "validation" | "commercial" | null;
  stageReason: string;
  nextTask: { title: string; dueDate?: string | null; targetFact: string };
  warnings?: string[];
};

type CustomerOption = { id: string; name: string };
type OpportunityOption = { id: string; name: string; accountId: string; stageId?: string; updatedAt?: string | number };

type OpportunityMode = "pipeline" | "forecast" | "lifecycle";
type FunnelStage = "lead" | "interest" | "experience" | "validation" | "commercial";
type LifecycleStatus = "active" | "paused" | "closed";
type CustomerKind = "教育机构" | "个体老师";

type PipelineCard = {
  id: string;
  accountId?: string;
  updatedAt?: string | number;
  kind: "lead" | "opportunity";
  stage: FunnelStage;
  lifecycle: LifecycleStatus;
  title: string;
  customer: string;
  contact?: string;
  customerKind: CustomerKind;
  owner: string;
  ownedByMe: boolean;
  product: string;
  evidence: string;
  stageAge: string;
  amount?: string;
  nextTask: string;
  due: string;
  taskSource: string;
  pauseReason?: string;
  reviewDate?: string;
  lifecycleVersion?: number;
};

type StageMoveDraft = {
  id: string;
  targetStage: Exclude<FunnelStage, "lead">;
  opportunityName: string;
  contactName: string;
  evidence: string;
  nextTask: string;
  money: string;
  closeDate: string;
  taskDueDate: string;
  idempotencyKey: string;
};

type NewLeadDraft = {
  name: string;
  companyName: string;
  mobile: string;
  customerDemand: string;
};

class CrmApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CrmApiError";
  }
}

async function readCrmApi(response: Response, fallbackMessage: string): Promise<Awaited<ReturnType<Response["json"]>>> {
  const body = await response.text();
  let data: unknown;

  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    const contentType = response.headers.get("content-type") || "";
    const looksLikeHtml = contentType.includes("text/html") || /^\s*</.test(body);
    const message = response.status === 401 || response.redirected
      ? "CRM 登录已失效，请重新登录"
      : looksLikeHtml
        ? "CRM 数据服务暂时不可用，请稍后重新读取"
        : `${fallbackMessage}（服务返回格式异常）`;
    throw new CrmApiError(message, response.status);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new CrmApiError(`${fallbackMessage}（服务返回格式异常）`, response.status);
  }

  if (!response.ok) {
    const error = "error" in data && typeof data.error === "string" ? data.error : "";
    const message = response.status === 401 ? "CRM 登录已失效，请重新登录" : error || fallbackMessage;
    throw new CrmApiError(message, response.status);
  }

  return data as Awaited<ReturnType<Response["json"]>>;
}

const funnelStages: { id: FunnelStage; label: string; hint: string; tone: string }[] = [
  { id: "lead", label: "潜客", hint: "确认身份与真实需求", tone: "lead" },
  { id: "interest", label: "兴趣", hint: "确认产品或采购场景", tone: "interest" },
  { id: "experience", label: "体验", hint: "安排演示、试用或样机", tone: "experience" },
  { id: "validation", label: "验证", hint: "取得使用反馈与适配结论", tone: "validation" },
  { id: "commercial", label: "商务推进", hint: "推进报价、合同与付款", tone: "commercial" },
];

const stageMoveCriteria: Record<Exclude<FunnelStage, "lead">, string> = {
  interest: "已确认具体产品方向或真实采购场景",
  experience: "已安排演示、试用、体验课或样机",
  validation: "已取得客户实际使用反馈或适配结论",
  commercial: "已发生报价、合同、付款或明确采购安排",
};

function moneyLabel(value: number): string {
  return `¥${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value || 0)}`;
}

function crmDate(value: unknown): Date | null {
  if (typeof value === "number" || /^\d{10,13}$/.test(String(value || ""))) {
    const numeric = Number(value);
    const date = new Date(String(Math.trunc(numeric)).length === 10 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysFromNow(value: unknown): number {
  const date = crmDate(value);
  return date ? Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000)) : 999;
}

function shortDate(value: unknown): string {
  const date = crmDate(value);
  return date ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date) : "待确认";
}

function crmObject(value: unknown): CrmRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as CrmRecord : {};
}

function nextPageCursor(value: unknown): string | null {
  const cursor = crmObject(crmObject(value).pagination).nextCursor;
  return typeof cursor === "string" && cursor ? cursor : null;
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const merged = new Map(current.map(item => [item.id, item]));
  incoming.forEach(item => merged.set(item.id, item));
  return [...merged.values()];
}

function customerItemsFromPayload(data: CrmRecord): CustomerItem[] {
  const customerPayload = crmObject(data.customers);
  const records = Array.isArray(customerPayload.records) ? customerPayload.records as CrmRecord[] : [];
  const userName = String(data.userName || "当前用户");
  const currentUserId = String(crmObject(data.user).userId || "");
  const owners = crmObject(data.owners) as Record<string, string>;
  return records.map((record) => {
    const recent = record.recentActivityRecordTime || record.RecentVisitDate__c || record.updatedAt;
    const activeDays = daysFromNow(recent);
    const createdDays = daysFromNow(record.createdAt);
    const storedLifecycle = String(record.lifecycleStatus || "");
    const lifecycle: CustomerLifecycle = ["new", "active", "attention", "paused", "closed"].includes(storedLifecycle)
      ? storedLifecycle as CustomerLifecycle
      : createdDays <= 30 ? "new" : activeDays <= 7 ? "active" : "attention";
    const nextTask = record.nextTask && typeof record.nextTask === "object" ? record.nextTask as { id?: string; title?: string; dueAt?: string } : null;
    return {
      id: String(record.id),
      name: String(record.accountName || "未命名客户"),
      form: String(record.AccountTypeJJ__c || record.entityType || "类型待确认"),
      city: String(record.cityA__c || record.provinceA__c || "地区待确认"),
      owner: owners[String(record.ownerId || "")] || (String(record.ownerId || "") === currentUserId ? userName : `销售 ${String(record.ownerId || "待确认")}`),
      ownedByMe: String(record.ownerId || "") === currentUserId,
      products: "从客户360加载",
      next: String(nextTask?.title || (activeDays <= 7 ? "查看最近进展" : "补充下一动作")),
      health: lifecycle === "new" ? "新建客户" : lifecycle === "active" ? "本周活跃" : "需要关注",
      tone: lifecycle === "new" ? "violet" : lifecycle === "active" ? "blue" : "red",
      lifecycle,
      lastFact: recent ? `最近 CRM 事实：${shortDate(recent)}` : "尚未取得有效客户事实",
      lastActiveDays: activeDays,
      pauseReason: record.lifecycleReason ? String(record.lifecycleReason) : undefined,
      reviewDate: record.reviewDate ? String(record.reviewDate) : undefined,
      version: Number(record.version || 0),
      nextTask,
    };
  });
}

function pipelinePageFromPayload(data: CrmRecord): { cards: PipelineCard[]; stageIds: Partial<Record<Exclude<FunnelStage, "lead">, string>> } {
  const customerRecords = Array.isArray(crmObject(data.customers).records) ? crmObject(data.customers).records as CrmRecord[] : [];
  const currentUserId = String(crmObject(data.user).userId || "");
  const owners = crmObject(data.owners) as Record<string, string>;
  const customerById = new Map(customerRecords.map(record => [String(record.id), record]));
  const lifecycleById = crmObject(crmObject(data.opportunityLifecycle).records) as Record<string, CrmRecord>;
  const dictionary = Array.isArray(crmObject(data.stageDictionary).stages) ? crmObject(data.stageDictionary).stages as CrmRecord[] : [];
  const stageById = new Map(dictionary.map(stage => [String(stage.stageId), String(stage.normalizedStage || "unknown")]));
  const stageIds: Partial<Record<Exclude<FunnelStage, "lead">, string>> = {};
  dictionary.forEach((item) => {
    const normalized = String(item.normalizedStage || "unknown");
    const stage = normalized === "business" ? "commercial" : normalized;
    if (["interest", "experience", "validation", "commercial"].includes(stage) && item.stageId) {
      stageIds[stage as Exclude<FunnelStage, "lead">] = String(item.stageId);
    }
  });
  const opportunityRecords = Array.isArray(crmObject(data.opportunities).records) ? crmObject(data.opportunities).records as CrmRecord[] : [];
  const opportunityCards: PipelineCard[] = opportunityRecords.flatMap((record) => {
    const normalized = stageById.get(String(record.saleStageId || ""));
    if (!normalized || normalized === "unknown") return [];
    const stage: FunnelStage = normalized === "business" ? "commercial" : normalized as FunnelStage;
    const customer = customerById.get(String(record.accountId || "")) || {};
    const lifecycle = lifecycleById[String(record.id)] || {};
    const customerName = String(customer.accountName || `客户 ${String(record.accountId || "待关联")}`);
    const typeText = String(customer.AccountTypeJJ__c || customer.entityType || "");
    return [{
      id: String(record.id),
      accountId: String(record.accountId || ""),
      updatedAt: record.updatedAt as string | number | undefined,
      kind: "opportunity" as const,
      stage,
      lifecycle: (["active", "paused", "closed"].includes(String(lifecycle.status)) ? String(lifecycle.status) : "active") as LifecycleStatus,
      lifecycleVersion: Number(lifecycle.version || 0),
      title: String(record.opportunityName || "未命名商机"),
      customer: customerName,
      customerKind: /个人|老师|名师/.test(typeText) ? "个体老师" as const : "教育机构" as const,
      owner: owners[String(record.ownerId || "")] || (String(record.ownerId || "") === currentUserId ? "我" : `销售 ${String(record.ownerId || "待确认")}`),
      ownedByMe: String(record.ownerId || "") === currentUserId,
      product: "产品信息待从商机详情补齐",
      evidence: `CRM 真实商机 · 阶段更新时间 ${shortDate(record.updatedAt)}`,
      stageAge: `最近更新 ${shortDate(record.updatedAt)}`,
      amount: moneyLabel(Number(record.money || 0)),
      nextTask: "补充可验证的下一任务",
      due: "需处置",
      taskSource: "CRM 商机",
      pauseReason: lifecycle.reason ? String(lifecycle.reason) : undefined,
      reviewDate: lifecycle.reviewDate ? String(lifecycle.reviewDate) : undefined,
    }];
  });
  const leadPayload = crmObject(data.leads);
  const rawLeadRecords = Array.isArray(crmObject(leadPayload.result).records)
    ? crmObject(leadPayload.result).records as CrmRecord[]
    : Array.isArray(crmObject(leadPayload.data).records)
      ? crmObject(leadPayload.data).records as CrmRecord[]
      : Array.isArray(leadPayload.records) ? leadPayload.records as CrmRecord[] : [];
  const leadCards: PipelineCard[] = rawLeadRecords.map((record) => {
    const customerName = String(record.companyName || record.name || "未命名潜客");
    return {
      id: String(record.id),
      kind: "lead",
      stage: "lead",
      lifecycle: "active",
      title: customerName,
      customer: customerName,
      contact: record.name ? String(record.name) : undefined,
      customerKind: /老师|个人/.test(customerName) || !record.companyName ? "个体老师" : "教育机构",
      owner: owners[String(record.ownerId || "")] || (String(record.ownerId || "") === currentUserId ? "我" : `销售 ${String(record.ownerId || "待确认")}`),
      ownedByMe: String(record.ownerId || "") === currentUserId,
      product: "待首次沟通确认",
      evidence: record.mobile ? "CRM 潜客已有联系电话" : "CRM 潜客尚缺联系电话",
      stageAge: `最近更新 ${shortDate(record.updatedAt || record.createdAt)}`,
      nextTask: "完成首次联系并确认客户主体、联系人和使用场景",
      due: "尽快",
      taskSource: "CRM 潜客",
    };
  });
  return { cards: [...leadCards, ...opportunityCards], stageIds };
}

function forecastItemsFromPayload(data: CrmRecord): ForecastItem[] {
  const customerRecords = Array.isArray(crmObject(data.customers).records) ? crmObject(data.customers).records as CrmRecord[] : [];
  const accountNames = new Map(customerRecords.map(record => [String(record.id), String(record.accountName || "未命名客户")]));
  const currentUserId = String(crmObject(data.user).userId || "");
  const owners = crmObject(data.owners) as Record<string, string>;
  const opportunityRecords = Array.isArray(crmObject(data.opportunities).records) ? crmObject(data.opportunities).records as CrmRecord[] : [];
  return opportunityRecords.map(record => ({
    id: String(record.id),
    name: String(record.opportunityName || "未命名商机"),
    customer: accountNames.get(String(record.accountId)) || `客户 ${String(record.accountId || "待关联")}`,
    stage: record.saleStageId ? `CRM 阶段 ${String(record.saleStageId)}` : "阶段待确认",
    amount: Number(record.money || 0),
    forecastAmount: Number(record.fcastMoney || record.money || 0),
    evidence: `CRM 预计关闭：${shortDate(record.closeDate)}`,
    next: `预计 ${shortDate(record.closeDate)}`,
    risk: Number(record.fcastMoney || 0) > 0 ? "已有预测金额" : "待补预测依据",
    closeDate: String(record.closeDate || ""),
    owner: owners[String(record.ownerId || "")] || (String(record.ownerId || "") === currentUserId ? "我" : `销售 ${String(record.ownerId || "待确认")}`),
    ownedByMe: String(record.ownerId || "") === currentUserId,
  }));
}

export default function Home() {
  const [auth, setAuth] = useState<{ state: "loading" | "anonymous" | "authorizing" | "authenticated" | "error"; userId?: string; userName?: string; message?: string }>({ state: "loading" });
  const [view, setView] = useState<View>("workbench");
  const [taskTab, setTaskTab] = useState("待我处理");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskDataState, setTaskDataState] = useState<DataState>("loading");
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskRefresh, setTaskRefresh] = useState(0);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
  const [taskClock] = useState(() => Date.now());
  const [composerOpen, setComposerOpen] = useState(false);
  const [composeStep, setComposeStep] = useState<"write" | "review" | "done">("write");
  const [note, setNote] = useState("王校长确认一体机演示效果符合预期，准备先采购6台，希望下周收到正式报价。周五前我提交报价单。");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeMessage, setComposeMessage] = useState<string | null>(null);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [opportunityOptions, setOpportunityOptions] = useState<OpportunityOption[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState("");
  const [composeStageIds, setComposeStageIds] = useState<Partial<Record<Exclude<FunnelStage, "lead">, string>>>({});
  const [applySuggestedStage, setApplySuggestedStage] = useState(false);
  const [composeIdempotencyKey, setComposeIdempotencyKey] = useState(() => `followup-${Date.now()}`);

  const title = navigation.find((item) => item.id === view)?.label ?? "今日工作台";
  const visibleTasks = useMemo(() => taskTab === "全部任务" ? tasks : taskTab === "已完成" ? tasks.filter((task) => task.completed) : tasks.filter((task) => !task.completed), [taskTab, tasks]);
  const completedTaskCount = tasks.filter((task) => task.completed).length;
  const taskCompletionRate = tasks.length ? Math.round(completedTaskCount / tasks.length * 100) : 0;

  useEffect(() => {
    fetch("/api/crm-auth/status", { cache: "no-store" })
      .then((response) => readCrmApi(response, "CRM 登录状态读取失败"))
      .then((data) => setAuth(data.authenticated ? { state: "authenticated", ...data.session } : { state: "anonymous" }))
      .catch((error) => setAuth({ state: "error", message: error instanceof Error ? error.message : "暂时无法连接企培 CRM MCP" }));
  }, []);

  useEffect(() => {
    if (auth.state !== "authenticated" || !["workbench", "tasks"].includes(view)) return;
    let active = true;
    fetch("/api/crm/data?view=tasks", { cache: "no-store" })
      .then(async (response) => {
        const data = await readCrmApi(response, "任务中心查询失败");
        const statusDictionary = Array.isArray(data.realTasks?.statusDictionary) ? data.realTasks.statusDictionary : [];
        const statusLabels = new Map<string, string>(statusDictionary.map((item: CrmRecord) => [String(item.value), String(item.label || item.value)]));
        const realRecords = Array.isArray(data.realTasks?.records) ? data.realTasks.records : [];
        const realTasks: TaskItem[] = realRecords.map((record: CrmRecord) => {
          const association = record.association && typeof record.association === "object" ? record.association as CrmRecord : {};
          const due = crmDate(record.planFinishDate);
          const statusLabel = statusLabels.get(String(record.status)) || `状态 ${String(record.status || "未知")}`;
          return {
            id: String(record.id), kind: "real", completed: /已完成|完成|closed|complete/i.test(statusLabel),
            time: due ? shortDate(due) : "待定", urgency: due && due.getTime() < taskClock ? "overdue" : due && due.getTime() < taskClock + 86400000 ? "today" : "later",
            customer: String(association.name || "企培任务"), title: String(record.taskName || "未命名任务"),
            fact: String(record.description || record.taskRemark || "完成任务并记录取得的客户事实"),
            reason: String(record.taskRemark || "销售易已下发任务"), source: `销售易任务 · ${statusLabel}`,
            owner: "我", action: "完成", dueAt: record.planFinishDate as string | number | undefined,
            associationId: association.id ? String(association.id) : undefined,
            associationType: association.type === "lead" ? "lead" : association.type === "opportunity" ? "opportunity" : "account", statusLabel,
          };
        });
        const openRuleTasks = realRecords
          .filter((_: CrmRecord, index: number) => !realTasks[index]?.completed)
          .map((record: CrmRecord) => {
            const association = record.association && typeof record.association === "object" ? record.association as CrmRecord : {};
            return { remark: String(record.taskRemark || ""), associationId: String(association.id || "") };
          });
        const actions = (Array.isArray(data.candidates?.actions) ? data.candidates.actions : [])
          .filter((action: CrmRecord) => {
            const account = action.account && typeof action.account === "object" ? action.account as CrmRecord : {};
            const opportunity = action.opportunity && typeof action.opportunity === "object" ? action.opportunity as CrmRecord : {};
            const lead = action.lead && typeof action.lead === "object" ? action.lead as CrmRecord : {};
            const evidence = action.evidence && typeof action.evidence === "object" ? action.evidence as CrmRecord : {};
            const candidateKey = String(action.candidateKey || "");
            const ruleId = String(action.ruleId || "");
            const candidateAssociationId = String(lead.leadId || evidence.leadId || opportunity.opportunityId || evidence.opportunityId || account.accountId || evidence.accountId || "");
            return !openRuleTasks.some(({ remark, associationId: openAssociationId }: { remark: string; associationId: string }) =>
              (candidateKey && remark.includes(`候选编号：${candidateKey}`)) ||
              (!remark.includes("候选编号：") && candidateAssociationId && openAssociationId === candidateAssociationId && remark.includes(`规则来源：${ruleId}`))
            );
          });
        const candidates: TaskItem[] = actions.map((action: CrmRecord, index: number) => {
          const account = action.account && typeof action.account === "object" ? action.account as CrmRecord : {};
          const opportunity = action.opportunity && typeof action.opportunity === "object" ? action.opportunity as CrmRecord : {};
          const lead = action.lead && typeof action.lead === "object" ? action.lead as CrmRecord : {};
          const evidence = action.evidence && typeof action.evidence === "object" ? action.evidence as CrmRecord : {};
          const period = evidence.period && typeof evidence.period === "object" ? evidence.period as CrmRecord : {};
          const priority = String(action.priority || "P2");
          const ruleId = String(action.ruleId || "企培任务规则");
          const opportunityId = String(opportunity.opportunityId || evidence.opportunityId || "");
          const leadId = String(lead.leadId || evidence.leadId || "");
          const accountId = String(account.accountId || evidence.accountId || opportunity.accountId || "");
          const candidateKey = String(action.candidateKey || `${ruleId}:${leadId || opportunityId || accountId || index}`);
          const source = ruleId.startsWith("usage_zero_") && period.from && period.to
            ? `数仓使用规则 · ${String(period.from)}—${String(period.to)}`
            : ruleId;
          return {
            id: candidateKey,
            kind: "candidate",
            time: priority === "P0" ? "本周优先" : "本周",
            urgency: priority === "P0" ? "overdue" : priority === "P1" ? "today" : "later",
            customer: String(account.accountName || lead.companyName || opportunity.opportunityName || action.customerName || "经营任务"),
            title: String(action.title || "待处理任务"),
            fact: String(action.suggestedAction || "取得下一项客户事实"),
            reason: String(action.reason || "企培任务规则触发"),
            source,
            ruleId,
            candidateKey,
            owner: "我",
            action: "生成任务",
            associationId: leadId || opportunityId || accountId || undefined,
            associationType: leadId ? "lead" : opportunityId ? "opportunity" : "account",
          };
        });
        if (active) {
          setTasks([...realTasks, ...candidates]);
          setTaskDataState("real");
        }
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof CrmApiError && error.status === 401) {
          setAuth({ state: "anonymous" });
          return;
        }
        setTasks([]);
        setTaskError(error instanceof Error ? error.message : "任务中心查询失败");
        setTaskDataState("error");
      });
    return () => { active = false; };
  }, [auth.state, taskClock, taskRefresh, view]);

  useEffect(() => {
    if (auth.state !== "authenticated" || !composerOpen) return;
    let active = true;
    fetch("/api/crm/data?view=pipeline", { cache: "no-store" })
      .then(async (response) => {
        const data = await readCrmApi(response, "客户查询失败");
        const options = (Array.isArray(data.customers?.records) ? data.customers.records : []).map((record: CrmRecord) => ({ id: String(record.id), name: String(record.accountName || "未命名客户") }));
        const opportunities = (Array.isArray(data.opportunities?.records) ? data.opportunities.records : []).map((record: CrmRecord) => ({
          id: String(record.id), name: String(record.opportunityName || "未命名商机"), accountId: String(record.accountId || ""),
          stageId: record.saleStageId ? String(record.saleStageId) : undefined,
          updatedAt: record.updatedAt as string | number | undefined,
        }));
        const stageIds: Partial<Record<Exclude<FunnelStage, "lead">, string>> = {};
        (Array.isArray(data.stageDictionary?.stages) ? data.stageDictionary.stages : []).forEach((record: CrmRecord) => {
          const normalized = String(record.normalizedStage || "") === "business" ? "commercial" : String(record.normalizedStage || "");
          if (["interest", "experience", "validation", "commercial"].includes(normalized) && record.stageId) {
            stageIds[normalized as Exclude<FunnelStage, "lead">] = String(record.stageId);
          }
        });
        if (active) {
          setCustomerOptions(options);
          setOpportunityOptions(opportunities);
          setComposeStageIds(stageIds);
          setSelectedCustomerId((current) => current || options[0]?.id || "");
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [auth.state, composerOpen]);

  async function startCrmLogin() {
    setAuth({ state: "authorizing" });
    try {
      const response = await fetch("/api/crm-auth/start", { method: "POST" });
      const data = await readCrmApi(response, "无法启动 CRM 登录");
      const loginWindow = window.open(data.authorizeUrl, "crm-oauth", "popup=yes,width=760,height=760");
      if (!loginWindow) window.location.href = data.authorizeUrl;
      for (let attempt = 0; attempt < 150; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1600));
        const poll = await fetch(`/api/crm-auth/poll?loginId=${encodeURIComponent(data.loginId)}`, { cache: "no-store" });
        const result = await readCrmApi(poll, "CRM 登录失败");
        if (result.status === "authenticated") {
          loginWindow?.close();
          setAuth({ state: "authenticated", userId: result.userId, userName: result.userName });
          return;
        }
        if (result.status === "expired") throw new Error("CRM 授权已过期，请重新登录");
      }
      throw new Error("等待 CRM 授权超时，请重试");
    } catch (error) {
      setAuth({ state: "error", message: error instanceof Error ? error.message : "CRM 登录失败" });
    }
  }

  async function logout() {
    await fetch("/api/crm-auth/logout", { method: "POST" });
    setAuth({ state: "anonymous" });
  }

  async function handleTaskPrimary(id: string) {
    const task = tasks.find((item) => item.id === id);
    if (!task || taskBusyId) return;
    setTaskBusyId(id);
    setTaskMessage(null);
    try {
      if (task.kind === "candidate") {
        if (!task.associationId) throw new Error("该规则建议缺少明确潜客、客户或商机，暂不能直接生成任务。");
        const dueDate = new Date(taskClock + 86400000).toISOString().slice(0, 10);
        const response = await fetch("/api/crm/actions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create-task", payload: {
            taskName: task.title, planFinishDate: dueDate,
            ...(task.associationType === "lead" ? { leadId: task.associationId } : task.associationType === "opportunity" ? { opportunityId: task.associationId } : { accountId: task.associationId }),
            description: task.fact, taskRemark: `规则来源：${task.ruleId || task.source}；候选编号：${task.candidateKey || task.id}；触发原因：${task.reason}`,
          } }),
        });
        const data = await readCrmApi(response, "规则建议生成任务失败");
        const result = data.result?.data || data.result?.result || data.result || {};
        setTasks((items) => items.map((item) => item.id === id ? {
          ...item, id: String(result.id || `created-${id}`), kind: "real", source: "销售易任务 · 进行中",
          statusLabel: "进行中", dueAt: dueDate, time: shortDate(dueDate), urgency: "today", action: "完成",
        } : item));
        setTaskMessage("规则建议已创建为真实销售易任务，截止到明天。");
      } else {
        const response = await fetch("/api/crm/actions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update-task", payload: { taskId: task.id, operation: "complete", taskRemark: "已在企培 CRM 任务中心确认完成" } }),
        });
        await readCrmApi(response, "任务完成失败");
        setTasks((items) => items.map((item) => item.id === id ? { ...item, completed: true, statusLabel: "已完成", source: "销售易任务 · 已完成", action: "已完成" } : item));
        setTaskMessage("任务已在销售易中标记完成。");
      }
    } catch (error) {
      setTaskMessage(error instanceof Error ? error.message : "任务更新失败");
    } finally {
      setTaskBusyId(null);
    }
  }

  async function rescheduleTask(id: string) {
    const task = tasks.find((item) => item.id === id);
    if (!task || task.kind !== "real" || task.completed || taskBusyId) return;
    setTaskBusyId(id);
    setTaskMessage(null);
    try {
      const currentDue = crmDate(task.dueAt)?.getTime() || taskClock;
      const nextDue = new Date(Math.max(currentDue, taskClock) + 86400000).toISOString().slice(0, 10);
      const response = await fetch("/api/crm/actions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-task", payload: { taskId: task.id, operation: "reschedule", planFinishDate: nextDue, taskRemark: "在企培 CRM 任务中心延期一天" } }),
      });
      await readCrmApi(response, "任务延期失败");
      setTasks((items) => items.map((item) => item.id === id ? { ...item, dueAt: nextDue, time: shortDate(nextDue), urgency: "later" } : item));
      setTaskMessage(`任务已延期到 ${shortDate(nextDue)}。`);
    } catch (error) {
      setTaskMessage(error instanceof Error ? error.message : "任务延期失败");
    } finally {
      setTaskBusyId(null);
    }
  }

  function finishTask(id: string) {
    void handleTaskPrimary(id);
  }

  function openComposer() {
    setComposeStep("write");
    setAnalysis(null);
    setComposeMessage(null);
    setSelectedOpportunityId("");
    setApplySuggestedStage(false);
    setComposeIdempotencyKey(`followup-${crypto.randomUUID()}`);
    setComposerOpen(true);
  }

  async function analyzeNote() {
    setComposeBusy(true);
    setComposeMessage(null);
    try {
      const customer = customerOptions.find((item) => item.id === selectedCustomerId);
      const opportunity = opportunityOptions.find((item) => item.id === selectedOpportunityId);
      const response = await fetch("/api/crm/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, context: { accountId: selectedCustomerId, accountName: customer?.name, opportunityId: opportunity?.id, opportunityName: opportunity?.name } }),
      });
      const data = await readCrmApi(response, "智能分析失败");
      setAnalysis(data);
      setComposeStep("review");
    } catch (error) {
      setComposeMessage(error instanceof Error ? error.message : "智能分析失败");
    } finally {
      setComposeBusy(false);
    }
  }

  async function confirmUpdate() {
    if (!selectedCustomerId || !analysis) return;
    setComposeBusy(true);
    setComposeMessage(null);
    try {
      const structuredSummary = [
        note,
        "",
        "【企培 CRM 智能整理】",
        ...analysis.facts.map((fact) => `- ${fact.type}：${fact.value}`),
        analysis.suggestedStage ? `- 建议商机阶段：${funnelStages.find((stage) => stage.id === analysis.suggestedStage)?.label || analysis.suggestedStage}（${analysis.stageReason}）` : "- 商机阶段：无足够事实建议变更",
        `- 建议下一任务：${analysis.nextTask.title}`,
        `- 目标事实：${analysis.nextTask.targetFact}`,
      ].join("\n");
      const selectedOpportunity = opportunityOptions.find((item) => item.id === selectedOpportunityId);
      const suggestedStageId = analysis.suggestedStage ? composeStageIds[analysis.suggestedStage] : undefined;
      const defaultDue = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const response = await fetch("/api/crm/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm-followup", payload: {
          idempotencyKey: composeIdempotencyKey,
          accountId: selectedCustomerId,
          ...(selectedOpportunity ? { opportunityId: selectedOpportunity.id } : {}),
          activity: { content: structuredSummary, startTime: Date.now() },
          task: { taskName: analysis.nextTask.title, planFinishDate: analysis.nextTask.dueDate || defaultDue, targetFact: analysis.nextTask.targetFact },
          ...(applySuggestedStage && selectedOpportunity && suggestedStageId ? { stage: {
            saleStageId: suggestedStageId,
            expectedUpdatedAt: selectedOpportunity.updatedAt,
            evidence: analysis.stageReason,
          } } : {}),
        } }),
      });
      await readCrmApi(response, "客户进展写入失败；可直接重试，已完成步骤不会重复创建");
      setComposeMessage(applySuggestedStage && selectedOpportunity && suggestedStageId
        ? "客户活动、商机任务和确认后的阶段已写入销售易。"
        : `客户活动和下一任务已写入销售易${selectedOpportunity ? "，任务已关联到具体商机" : ""}。`);
      setComposeStep("done");
    } catch (error) {
      setComposeMessage(error instanceof Error ? error.message : "同步更新失败");
    } finally {
      setComposeBusy(false);
    }
  }

  if (auth.state !== "authenticated") return <CrmLogin state={auth.state} message={auth.message} onLogin={startCrmLogin} />;

  const displayName = auth.userName || "CRM 用户";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-glyph">CRM</span><div><strong>企培 CRM</strong><small>销售经营平台</small></div></div>
        <nav className="main-nav" aria-label="主导航">
          <p className="nav-label">工作空间</p>
          {navigation.map((item) => (
            <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)}>
              <span className="nav-mark">{item.mark}</span><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}
            </button>
          ))}
        </nav>
        <section className="sidebar-focus">
          <div className="focus-head"><span>任务完成</span><strong>{taskCompletionRate}%</strong></div>
          <div className="focus-meter"><i style={{ width: `${taskCompletionRate}%` }} /></div>
          <p>{tasks.length} 项真实任务与规则建议，已完成 {completedTaskCount} 项</p>
        </section>
        <div className="profile"><span className="avatar">{displayName.slice(0, 1)}</span><div><strong>{displayName}</strong><small>企业培训事业部 · CRM 已认证</small></div><button aria-label="退出 CRM" title="退出 CRM" onClick={logout}>退出</button></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="breadcrumb">销售经营 / {title}</p><h1>{title}</h1></div>
          <div className="top-actions"><label className="search"><span>⌕</span><input aria-label="搜索" placeholder="搜索客户、联系人或商机" /></label><button className="notification" aria-label="通知">◌<i /></button><button className="primary-button" onClick={openComposer}><span>＋</span> 记录客户进展</button></div>
        </header>

        {view === "workbench" && <Workbench userName={displayName} tasks={tasks} onCompose={openComposer} onFinish={finishTask} onJump={setView} />}
        {view === "tasks" && <TaskCenter tasks={visibleTasks} tab={taskTab} setTab={setTaskTab} dataState={taskDataState} error={taskError} message={taskMessage} busyId={taskBusyId} onRetry={() => { setTaskDataState("loading"); setTaskError(null); setTaskRefresh((value) => value + 1); }} onPrimary={handleTaskPrimary} onReschedule={rescheduleTask} onCompose={openComposer} />}
        {view === "customers" && <CustomerList onCompose={openComposer} />}
        {view === "opportunities" && <OpportunityList onCompose={openComposer} />}
        {view === "activities" && <ActivityView onCompose={openComposer} />}
        {view === "insights" && <InsightView />}
      </section>

      {composerOpen && <Composer step={composeStep} note={note} setNote={setNote} analysis={analysis} busy={composeBusy} message={composeMessage} customers={customerOptions} selectedCustomerId={selectedCustomerId} setSelectedCustomerId={(id) => { setSelectedCustomerId(id); setSelectedOpportunityId(""); setApplySuggestedStage(false); }} opportunities={opportunityOptions.filter((item) => item.accountId === selectedCustomerId)} selectedOpportunityId={selectedOpportunityId} setSelectedOpportunityId={(id) => { setSelectedOpportunityId(id); setApplySuggestedStage(false); }} applySuggestedStage={applySuggestedStage} setApplySuggestedStage={setApplySuggestedStage} stageCanApply={Boolean(analysis?.suggestedStage && composeStageIds[analysis.suggestedStage])} onClose={() => setComposerOpen(false)} onAnalyze={analyzeNote} onBack={() => setComposeStep("write")} onConfirm={confirmUpdate} />}
    </main>
  );
}

function CrmLogin({ state, message, onLogin }: { state: "loading" | "anonymous" | "authorizing" | "error"; message?: string; onLogin: () => void }) {
  return <main className="login-shell"><section className="login-panel"><div className="login-brand"><span>CRM</span><div><strong>企培 CRM</strong><small>企业培训销售经营平台</small></div></div><div className="login-visual"><i /><i /><i /><span><b>企培</b><small>CRM</small></span></div><div className="login-copy"><span className="eyebrow">企业培训事业部</span><h1>用你的 CRM 身份<br />进入销售经营平台</h1><p>系统通过企培 CRM MCP 完成销售易 OAuth 授权。每个人使用自己的 CRM 权限，客户和商机数据范围不会越过企培组织边界。</p><div className="login-security"><div><b>01</b><span><strong>CRM 原生身份</strong><small>不使用 ChatGPT 账号作为业务身份</small></span></div><div><b>02</b><span><strong>会话安全隔离</strong><small>Token 仅保存在 HttpOnly 会话中</small></span></div><div><b>03</b><span><strong>企培数据边界</strong><small>查询与写回均由 MCP 服务端校验</small></span></div></div>{state === "loading" ? <button className="crm-login-button" disabled><i />正在检查 CRM 登录状态…</button> : state === "authorizing" ? <button className="crm-login-button" disabled><i className="spinner" />请在新窗口完成销售易授权</button> : <button className="crm-login-button" onClick={onLogin}>使用 CRM 账号登录 <span>→</span></button>}{state === "error" && <div className="login-error">{message}<button onClick={onLogin}>重新尝试</button></div>}<small className="login-footnote">认证服务：Enterprise Training CRM MCP · 销售易 OAuth</small></div></section></main>;
}

function Workbench({ userName, tasks, onCompose, onFinish, onJump }: { userName: string; tasks: TaskItem[]; onCompose: () => void; onFinish: (id: string) => void; onJump: (view: View) => void }) {
  const openTasks = tasks.filter((task) => !task.completed);
  const overdueTasks = openTasks.filter((task) => task.urgency === "overdue");
  const todayLabel = new Intl.DateTimeFormat("zh-CN", { weekday: "long", month: "numeric", day: "numeric" }).format(new Date());
  const firstTask = openTasks[0];
  return <div className="page-content dashboard-page">
    <section className="morning-brief">
      <div><span className="eyebrow">{todayLabel}</span><h2>早上好，{userName}。<br />当前有 <b>{openTasks.length} 项开放任务</b>。</h2><p>{firstTask ? `建议先处理“${firstTask.title}”，并记录本次取得的客户事实。` : "当前没有开放任务，可以记录新的客户进展。"}</p><div className="brief-actions"><button className="primary-button light" onClick={onCompose}>记录一段客户进展</button><button className="text-button" onClick={() => onJump("tasks")}>查看今日完整安排 →</button></div></div>
      <div className="brief-score"><div className="score-ring"><strong>{openTasks.length}</strong><span>开放任务</span></div><small>{overdueTasks.length ? `其中 ${overdueTasks.length} 项已逾期` : "当前没有逾期任务"}</small></div>
    </section>

    <section className="metric-grid">
      <Metric label="开放事实任务" value={String(openTasks.length)} detail={`${overdueTasks.length} 项已逾期`} accent="indigo" />
      <Metric label="30天承诺预测" value="—" detail="进入商机页查看实时数据" accent="blue" />
      <Metric label="体验待反馈" value="—" detail="待接入体验规则口径" accent="amber" />
      <Metric label="开放商机健康度" value="—" detail="待阶段时钟完成业务校准" accent="green" />
    </section>

    <div className="content-grid">
      <section className="panel priority-panel">
        <PanelHeading eyebrow="按事实排序" title="现在最值得做" subtitle="每项任务都说明原因和需要取得的结果" action="查看全部" onAction={() => onJump("tasks")} />
        <div className="priority-list">{openTasks.slice(0, 3).map((task, index) => <PriorityTask key={task.id} task={task} index={index + 1} onFinish={onFinish} />)}</div>
      </section>
      <aside className="panel ai-guide">
        <div className="ai-heading"><span className="ai-orb">✦</span><div><span className="eyebrow">今日行动提示</span><h3>{firstTask?.title || "记录新的客户事实"}</h3></div></div>
        <p>{firstTask ? `${firstTask.customer}：${firstTask.reason}` : "系统不会用演示客户生成简报；有真实任务后将在这里给出行动提示。"}</p>
        <div className="guide-block"><span>需要取得</span><strong>{firstTask?.fact || "客户明确表达的场景、反馈或下一步安排"}</strong></div>
        <button className="guide-action" onClick={onCompose}>带着建议记录跟进 <span>→</span></button>
        <small>依据：当前登录人的真实销售易任务</small>
      </aside>
    </div>

    <div className="content-grid lower-grid">
      <section className="panel"><PanelHeading eyebrow="预测校准" title="需要关注的商机" subtitle="进入商机页读取当前账号的实时预测" action="进入商机" onAction={() => onJump("opportunities")} /><div className="empty-state">工作台不展示演示商机。</div></section>
      <section className="panel signal-panel"><PanelHeading eyebrow="产品机会" title="等待真实客户事实" subtitle="只有达到事实门槛的方向才会出现" />
        <blockquote>系统不会根据客户名称或静态样例推测交叉销售机会。</blockquote>
        <div className="signal-actions"><button className="solid" onClick={onCompose}>记录客户事实</button></div>
      </section>
    </div>
  </div>;
}

function Metric({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  return <article className="metric-card"><div className={`metric-icon ${accent}`}><i /></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function DataFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="data-failure" role="alert"><div><strong>真实数据读取失败</strong><p>{message}</p></div><button type="button" className="secondary-button" onClick={onRetry}>重新读取</button></div>;
}

function ScopeSelector({ scope, access, onChange }: { scope: DataScope; access: AccessInfo | null; onChange: (scope: DataScope) => void }) {
  const roleLabel = access ? { sales: "销售", manager: "主管", director: "事业部负责人" }[access.role] : "读取中";
  const evidence = access?.evidence?.length ? `；CRM 依据：${access.evidence.join(" / ")}` : "";
  const warning = access?.identityWarning ? `；${access.identityWarning}` : "";

  return <div className="scope-identity">
    <span className={`identity-pill${access?.identityWarning ? " warning" : ""}`} title={`${roleLabel}${evidence}${warning}`}>CRM 身份：{roleLabel}{access?.identityWarning ? "（已降级）" : ""}</span>
    {!access?.canViewTeam
      ? <span className="scope-caption">数据范围：我的</span>
      : <div className="scope-selector" aria-label="数据范围">
        <button className={scope === "mine" ? "active" : ""} onClick={() => onChange("mine")}>我的</button>
        <button className={scope === "team" ? "active" : ""} onClick={() => onChange("team")}>我的团队</button>
        {access.canViewOrganization && <button className={scope === "organization" ? "active" : ""} onClick={() => onChange("organization")}>企培全量</button>}
      </div>}
  </div>;
}

function PanelHeading({ eyebrow, title, subtitle, action, onAction }: { eyebrow?: string; title: string; subtitle: string; action?: string; onAction?: () => void }) {
  return <header className="panel-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h3>{title}</h3><p>{subtitle}</p></div>{action && <button onClick={onAction}>{action} →</button>}</header>;
}

function PriorityTask({ task, index, onFinish }: { task: TaskItem; index: number; onFinish: (id: string) => void }) {
  return <article className="priority-task"><span className={`task-order ${task.urgency}`}>{index}</span><div className="task-main"><div className="task-meta"><span>{task.time}</span><i /> <span>{task.source}</span></div><h4>{task.title}</h4><p><strong>{task.customer}</strong> · 要取得：{task.fact}</p><small>触发原因：{task.reason}</small></div><button className="task-action" onClick={() => onFinish(task.id)}>{task.action}</button></article>;
}

function TaskCenter({ tasks, tab, setTab, dataState, error, message, busyId, onRetry, onPrimary, onReschedule, onCompose }: { tasks: TaskItem[]; tab: string; setTab: (v: string) => void; dataState: DataState; error: string | null; message: string | null; busyId: string | null; onRetry: () => void; onPrimary: (id: string) => Promise<void>; onReschedule: (id: string) => Promise<void>; onCompose: () => void }) {
  return <div className="page-content"><section className="page-intro"><div><span className="eyebrow">统一行动中心</span><h2>不是“做完待办”，而是取得下一项客户事实</h2><p>线索、客户、商机和活动任务在这里统一排序，同时保留它为什么出现。</p></div><button className="primary-button" onClick={onCompose}>＋ 记录处理结果</button></section>
    {message && <div className="board-notice" role="status"><span>✓</span><p>{message}</p></div>}
    <section className="task-explain"><article><strong>真实任务</strong><span>已经存在于销售易，可完成或延期</span></article><article><strong>规则建议</strong><span>满足企培已确认规则，人工确认后才生成任务</span></article></section>
    <section className="panel table-panel"><div className="filter-row"><div className="tabs">{["待我处理", "全部任务", "已完成"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div><span className={`data-source-badge ${dataState}`}>{dataState === "real" ? "销售易真实任务 + 企培规则建议" : dataState === "loading" ? "正在同步任务中心" : "真实数据读取失败"}</span></div>
      {dataState === "error" && <DataFailure message={error || "任务中心读取失败"} onRetry={onRetry} />}
      <div className="task-table"><div className="task-table-head"><span>时效</span><span>任务与对象</span><span>需要取得的事实</span><span>为什么出现</span><span>负责人</span><span /></div>
      {dataState !== "error" && (tasks.length ? tasks.map((task) => <div className="task-table-row" key={task.id}><span className={`due ${task.urgency}`}>{task.time}</span><div><strong>{task.title}</strong><small>{task.customer} · {task.kind === "candidate" ? "规则建议" : task.statusLabel || "真实任务"} · {task.source}</small></div><span>{task.fact}</span><span>{task.reason}</span><span>{task.owner}</span><div className="task-row-actions">{task.kind === "real" && !task.completed && <button onClick={() => void onReschedule(task.id)} disabled={busyId === task.id}>延期一天</button>}<button onClick={() => task.completed ? onCompose() : void onPrimary(task.id)} disabled={busyId === task.id || task.completed}>{busyId === task.id ? "处理中…" : task.completed ? "已完成" : task.action}</button></div></div>) : dataState === "real" ? <div className="empty-state">当前筛选下没有真实任务或规则建议。</div> : <div className="empty-state">正在读取任务…</div>)}
      </div>
    </section>
  </div>;
}

function CustomerList({ onCompose }: { onCompose: () => void }) {
  const [items, setItems] = useState<CustomerItem[]>([]);
  const [tab, setTab] = useState<"全部客户" | "本周活跃" | "需要关注">("全部客户");
  const [mode, setMode] = useState<"list" | "lifecycle">("list");
  const [dataState, setDataState] = useState<DataState>("loading");
  const [dataError, setDataError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [scope, setScope] = useState<DataScope>("mine");
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [customerCursor, setCustomerCursor] = useState<string | null>(null);
  const [loadingMoreCustomers, setLoadingMoreCustomers] = useState(false);
  const [customerPageError, setCustomerPageError] = useState<string | null>(null);
  const [lifecycleDraft, setLifecycleDraft] = useState<{ id: string; action: "attention" | "pause" | "close" | "reactivate"; reason: string; reviewDate: string; taskTitle?: string; taskDueDate?: string } | null>(null);
  const [lifecycleSaving, setLifecycleSaving] = useState(false);
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/crm/data?view=customers&scope=${scope}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await readCrmApi(response, "客户查询失败") as CrmRecord;
        const mapped = customerItemsFromPayload(data);
        if (active) {
          setItems(mapped);
          setAccess(crmObject(data.access) as AccessInfo);
          setCustomerCursor(nextPageCursor(data.customers));
          setCustomerPageError(null);
          setDataState("real");
        }
      })
      .catch((error) => {
        if (!active) return;
        setItems([]);
        setCustomerCursor(null);
        setDataError(error instanceof Error ? error.message : "客户查询失败");
        setDataState("error");
      });
    return () => { active = false; };
  }, [refresh, scope]);

  function changeScope(nextScope: DataScope) {
    if (nextScope === scope) return;
    setItems([]);
    setCustomerCursor(null);
    setCustomerPageError(null);
    setDataState("loading");
    setDataError(null);
    setScope(nextScope);
  }

  async function loadMoreCustomers() {
    if (!customerCursor || loadingMoreCustomers) return;
    setLoadingMoreCustomers(true);
    setCustomerPageError(null);
    try {
      const response = await fetch(`/api/crm/data?view=customers&scope=${scope}&cursor=${encodeURIComponent(customerCursor)}`, { cache: "no-store" });
      const data = await readCrmApi(response, "下一页客户查询失败") as CrmRecord;
      setItems(current => mergeById(current, customerItemsFromPayload(data)));
      setCustomerCursor(nextPageCursor(data.customers));
    } catch (error) {
      setCustomerPageError(error instanceof Error ? error.message : "下一页客户查询失败");
    } finally {
      setLoadingMoreCustomers(false);
    }
  }

  const visibleItems = items.filter((item) => tab === "全部客户" || (tab === "本周活跃" ? item.lastActiveDays <= 7 && item.lifecycle !== "paused" : ["attention", "paused"].includes(item.lifecycle) || item.next === "需补充" || item.next === "补充下一动作"));
  const activeCount = items.filter((item) => item.lastActiveDays <= 7 && item.lifecycle !== "paused" && item.lifecycle !== "closed").length;
  const attentionCount = items.filter((item) => ["attention", "paused"].includes(item.lifecycle)).length;
  const lifecycleLabel: Record<CustomerLifecycle, string> = { new: "新建观察", active: "活跃经营", attention: "风险关注", paused: "暂停培育", closed: "已关闭" };

  async function applyCustomerLifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lifecycleDraft) return;
    const current = items.find((item) => item.id === lifecycleDraft.id);
    if (!current) return;
    const toStatus: CustomerLifecycle = lifecycleDraft.action === "reactivate" ? "active" : lifecycleDraft.action === "attention" ? "attention" : lifecycleDraft.action === "pause" ? "paused" : "closed";
    setLifecycleSaving(true);
    setLifecycleMessage(null);
    try {
      const response = await fetch("/api/crm/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "customer-lifecycle",
          payload: {
            accountId: current.id,
            fromStatus: current.lifecycle,
            toStatus,
            reason: lifecycleDraft.reason,
            reviewDate: toStatus === "paused" ? lifecycleDraft.reviewDate : undefined,
            nextTask: lifecycleDraft.action === "reactivate" ? {
              title: lifecycleDraft.taskTitle || "确认恢复后的下一动作",
              dueAt: lifecycleDraft.taskDueDate,
            } : undefined,
            version: current.version,
            idempotencyKey: crypto.randomUUID(),
            source: "qipei-crm-web",
          },
        }),
      });
      const data = await readCrmApi(response, "生命周期更新失败");
      const lifecycle = data.lifecycle || {};
      setItems((all) => all.map((item) => item.id !== current.id ? item : {
        ...item,
        lifecycle: String(lifecycle.lifecycleStatus || toStatus) as CustomerLifecycle,
        health: toStatus === "active" ? "本周活跃" : toStatus === "attention" ? "需要关注" : toStatus === "paused" ? "暂停培育" : "已关闭",
        tone: toStatus === "active" ? "blue" : toStatus === "attention" ? "red" : "amber",
        pauseReason: lifecycle.lifecycleReason || undefined,
        reviewDate: lifecycle.reviewDate || undefined,
        nextTask: lifecycle.nextTask || null,
        next: lifecycle.nextTask?.title || item.next,
        version: Number(lifecycle.version ?? item.version + 1),
        lastActiveDays: toStatus === "active" ? 0 : item.lastActiveDays,
      }));
      setLifecycleDraft(null);
      setLifecycleMessage("客户生命周期已写入企培 MCP，并保留审计记录。");
    } catch (error) {
      setLifecycleMessage(error instanceof Error ? error.message : "生命周期更新失败");
    } finally {
      setLifecycleSaving(false);
    }
  }

  return <div className="page-content customer-page"><section className="page-intro"><div><span className="eyebrow">统一客户主档</span><h2>客户经营与客户生命周期分开治理</h2><p>商机阶段回答“这笔采购走到哪”；客户生命周期回答“这段客户关系是否值得继续经营”。</p></div><button className="primary-button" onClick={onCompose}>＋ 记录客户进展</button></section>
    <section className="customer-command panel"><div className="customer-modes" aria-label="客户工作方式"><button className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>▦ 客户列表</button><button className={mode === "lifecycle" ? "active" : ""} onClick={() => setMode("lifecycle")}>◌ 生命周期治理</button></div><div className="scope-actions"><ScopeSelector scope={scope} access={access} onChange={changeScope} /><span className={`data-source-badge ${dataState}`}>{dataState === "real" ? "企培 MCP 实时数据" : dataState === "loading" ? "正在读取企培 CRM" : "真实数据读取失败"}</span></div></section>
    {dataState === "error" && <DataFailure message={dataError || "客户查询失败"} onRetry={() => { setDataState("loading"); setDataError(null); setRefresh((value) => value + 1); }} />}
    {lifecycleMessage && <div className="board-notice">{lifecycleMessage}</div>}
    <section className="metric-grid compact"><Metric label={scope === "mine" ? "我负责的客户" : scope === "team" ? "团队客户" : "企培客户"} value={String(items.filter((item) => item.lifecycle !== "closed").length)} detail={`${items.filter((item) => item.lifecycle === "new").length} 个新建观察`} accent="indigo" /><Metric label="7天有新事实" value={String(activeCount)} detail={`活跃客户占 ${items.length ? Math.round(activeCount / items.length * 100) : 0}%`} accent="green" /><Metric label="需要关注" value={String(attentionCount)} detail="风险与暂停客户" accent="amber" /><Metric label="暂停培育" value={String(items.filter((item) => item.lifecycle === "paused").length)} detail="均需设置复评日期" accent="blue" /></section>
    {mode === "list" && dataState !== "error" && <section className="panel table-panel"><div className="filter-row"><div className="tabs">{(["全部客户", "本周活跃", "需要关注"] as const).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div><div className="filter-summary">当前 {visibleItems.length} 个 · {scope === "mine" ? "负责人：我" : "按负责人展示"}</div></div><div className="customer-table"><div className="customer-table-head"><span>客户</span><span>当前产品</span><span>下一动作</span><span>经营状态</span><span>客户生命周期</span><span /></div>{visibleItems.map((item) => <div className="customer-row" key={item.id}><div className="customer-name"><span>{item.name.slice(0, 1)}</span><div><strong>{item.name}</strong><small>{item.form} · {item.city} · {item.owner}</small></div></div><span>{item.products}</span><span>{item.next}</span><span className={`status ${item.tone}`}>{item.health}</span><span className={`customer-lifecycle-pill ${item.lifecycle}`}>{lifecycleLabel[item.lifecycle]}</span>{item.ownedByMe ? <button onClick={onCompose}>记录进展</button> : <span className="read-only-pill">只读</span>}</div>)}{dataState === "real" && !visibleItems.length && <div className="empty-state">当前范围没有客户。</div>}{dataState === "loading" && <div className="empty-state">正在读取客户…</div>}</div>{customerPageError && <div className="pagination-error">{customerPageError}</div>}{customerCursor && <div className="pagination-bar"><span>已加载 {items.length} 个客户</span><button type="button" onClick={() => void loadMoreCustomers()} disabled={loadingMoreCustomers}>{loadingMoreCustomers ? "正在加载…" : "加载更多客户"}</button></div>}</section>}
    {mode === "lifecycle" && dataState !== "error" && <><section className="customer-lifecycle-overview"><article className="panel"><span className="eyebrow">独立于商机阶段</span><h3>客户关系状态</h3><p>同一个客户可以有多个商机；暂停一条商机不等于暂停整个客户，关闭客户也必须保留历史交易与活动。</p></article><article className="panel"><span className="eyebrow">建议规则 · 待业务校准</span><h3>治理触发条件</h3><div className="admission-list"><span>30 天无有效事实 → 风险关注</span><span>暂停必须设置复评日期</span><span>重新激活必须生成下一任务</span><span>关闭必须记录明确原因</span></div></article></section>
      <section className="panel customer-lifecycle-panel"><div className="customer-lifecycle-head"><div><span className="eyebrow">客户生命周期治理</span><h3>关系健康度与处置队列</h3><p>这里治理客户关系，不直接修改任何一条商机的事实阶段。</p></div></div><div className="customer-lifecycle-table"><div className="customer-lifecycle-row head"><span>客户</span><span>生命周期</span><span>最近事实</span><span>下一动作/复评</span><span>处置</span></div>{items.filter((item) => item.lifecycle !== "closed").map((item) => <div className="customer-lifecycle-row" key={item.id}><div><strong>{item.name}</strong><small>{item.form} · {item.owner}</small></div><span className={`customer-lifecycle-pill ${item.lifecycle}`}>{lifecycleLabel[item.lifecycle]}</span><p>{item.lastFact}<small>{item.lastActiveDays >= 999 ? "时间未知" : `${item.lastActiveDays} 天前`}</small></p><div><strong>{item.next}</strong><small>{item.lifecycle === "paused" ? `${item.reviewDate || "待设置"} 复评` : item.pauseReason || "持续经营"}</small></div>{item.ownedByMe ? <div className="row-actions">{item.lifecycle === "paused" ? <button onClick={() => setLifecycleDraft({ id: item.id, action: "reactivate", reason: "重新取得客户经营窗口", reviewDate: "", taskTitle: "确认恢复后的下一动作", taskDueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) })}>重新激活</button> : <><button onClick={() => setLifecycleDraft({ id: item.id, action: "attention", reason: "连续缺少有效客户事实", reviewDate: "" })}>关注</button><button onClick={() => setLifecycleDraft({ id: item.id, action: "pause", reason: "客户经营窗口暂不明确", reviewDate: "2026-08-24" })}>暂停</button><button onClick={() => setLifecycleDraft({ id: item.id, action: "close", reason: "客户明确不再合作", reviewDate: "" })}>关闭</button></>}</div> : <span className="read-only-pill">只读</span>}</div>)}</div></section></>}
    {lifecycleDraft && <div className="modal-backdrop" role="presentation"><form className="lifecycle-dialog" role="dialog" aria-modal="true" aria-label="客户生命周期处置" onSubmit={applyCustomerLifecycle}><header><div><span className="eyebrow">客户生命周期处置</span><h3>{lifecycleDraft.action === "reactivate" ? "重新激活客户关系" : lifecycleDraft.action === "pause" ? "暂停客户培育" : lifecycleDraft.action === "attention" ? "标记为需要关注" : "关闭客户关系"}</h3><p>该操作只改变客户关系状态，不会把客户名下商机自动推进、暂停或关闭。</p></div><button type="button" onClick={() => setLifecycleDraft(null)}>×</button></header><label>处置依据<input required value={lifecycleDraft.reason} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, reason: event.target.value })} /></label>{lifecycleDraft.action === "pause" && <label>重新评估日期<input type="date" required value={lifecycleDraft.reviewDate} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, reviewDate: event.target.value })} /></label>}{lifecycleDraft.action === "reactivate" && <><label>恢复后的下一任务<input required value={lifecycleDraft.taskTitle || ""} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, taskTitle: event.target.value })} /></label><label>任务截止日期<input type="date" required value={lifecycleDraft.taskDueDate || ""} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, taskDueDate: event.target.value })} /></label></>}<footer><button type="button" className="secondary-button" onClick={() => setLifecycleDraft(null)}>取消</button><button className="primary-button" type="submit" disabled={lifecycleSaving}>{lifecycleSaving ? "正在写入…" : "确认客户生命周期变化"}</button></footer></form></div>}
  </div>;
}

function OpportunityList({ onCompose }: { onCompose: () => void }) {
  const [mode, setMode] = useState<OpportunityMode>("pipeline");
  const [cards, setCards] = useState<PipelineCard[]>([]);
  const [customerKind, setCustomerKind] = useState<"全部" | CustomerKind>("全部");
  const [includePaused, setIncludePaused] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [lifecycleDraft, setLifecycleDraft] = useState<{ id: string; action: "pause" | "close" | "reactivate"; reason: string; reviewDate: string; taskTitle?: string; taskDueDate?: string } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<FunnelStage | null>(null);
  const [moveDraft, setMoveDraft] = useState<StageMoveDraft | null>(null);
  const [boardNotice, setBoardNotice] = useState<string | null>(null);
  const [forecastPeriod, setForecastPeriod] = useState<"30d" | "quarter">("30d");
  const [forecastItems, setForecastItems] = useState<ForecastItem[]>([]);
  const [forecastDataState, setForecastDataState] = useState<DataState>("loading");
  const [pipelineDataState, setPipelineDataState] = useState<DataState>("loading");
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [pipelineRefresh, setPipelineRefresh] = useState(0);
  const [forecastRefresh, setForecastRefresh] = useState(0);
  const [forecastCursor, setForecastCursor] = useState<string | null>(null);
  const [loadingMoreForecast, setLoadingMoreForecast] = useState(false);
  const [forecastPageError, setForecastPageError] = useState<string | null>(null);
  const [stageIds, setStageIds] = useState<Partial<Record<Exclude<FunnelStage, "lead">, string>>>({});
  const [newLead, setNewLead] = useState<NewLeadDraft | null>(null);
  const [writeBusy, setWriteBusy] = useState(false);
  const [writeClock] = useState(() => Date.now());
  const [scope, setScope] = useState<DataScope>("mine");
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [pipelineCursor, setPipelineCursor] = useState<string | null>(null);
  const [loadingMorePipeline, setLoadingMorePipeline] = useState(false);
  const [pipelinePageError, setPipelinePageError] = useState<string | null>(null);

  const visibleCards = cards.filter((card) => (customerKind === "全部" || card.customerKind === customerKind) && (includePaused || card.lifecycle === "active"));
  const activeOpportunities = cards.filter((card) => card.kind === "opportunity" && card.lifecycle === "active");
  const pausedCount = cards.filter((card) => card.lifecycle === "paused").length;
  const moveSource = moveDraft ? cards.find((card) => card.id === moveDraft.id) : undefined;
  const forecastTarget: number | null = null;
  const bestForecast = forecastItems.reduce((sum, item) => sum + item.amount, 0);
  const baseForecast = forecastItems.reduce((sum, item) => sum + item.forecastAmount, 0);

  useEffect(() => {
    let active = true;
    fetch(`/api/crm/data?view=pipeline&scope=${scope}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await readCrmApi(response, "潜客与商机查询失败") as CrmRecord;
        const page = pipelinePageFromPayload(data);
        if (active) {
          setCards(page.cards);
          setAccess(crmObject(data.access) as AccessInfo);
          setStageIds(page.stageIds);
          setPipelineCursor(nextPageCursor(data));
          setPipelinePageError(null);
          setPipelineDataState("real");
          setBoardNotice("当前看板已读取真实潜客、客户、商机、阶段和生命周期；潜客转化、阶段调整以及暂停/关闭/激活均会在人工确认后写回并保留审计。");
        }
      })
      .catch((error) => {
        if (!active) return;
        setCards([]);
        setPipelineCursor(null);
        setPipelineError(error instanceof Error ? error.message : "潜客与商机查询失败");
        setPipelineDataState("error");
      });
    return () => { active = false; };
  }, [pipelineRefresh, scope]);

  async function loadMorePipeline() {
    if (!pipelineCursor || loadingMorePipeline) return;
    setLoadingMorePipeline(true);
    setPipelinePageError(null);
    try {
      const response = await fetch(`/api/crm/data?view=pipeline&scope=${scope}&cursor=${encodeURIComponent(pipelineCursor)}`, { cache: "no-store" });
      const data = await readCrmApi(response, "下一页潜客与商机查询失败") as CrmRecord;
      const page = pipelinePageFromPayload(data);
      setCards(current => mergeById(current, page.cards));
      setStageIds(current => ({ ...current, ...page.stageIds }));
      setPipelineCursor(nextPageCursor(data));
    } catch (error) {
      setPipelinePageError(error instanceof Error ? error.message : "下一页潜客与商机查询失败");
    } finally {
      setLoadingMorePipeline(false);
    }
  }

  useEffect(() => {
    if (mode !== "forecast") return;
    let active = true;
    fetch(`/api/crm/data?view=forecast&period=${forecastPeriod}&scope=${scope}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await readCrmApi(response, "商机预测查询失败") as CrmRecord;
        const mapped = forecastItemsFromPayload(data);
        if (active) {
          setForecastItems(mapped);
          setForecastCursor(nextPageCursor(data.opportunities));
          setForecastPageError(null);
          setForecastDataState("real");
        }
      })
      .catch((error) => {
        if (!active) return;
        setForecastItems([]);
        setForecastCursor(null);
        setForecastError(error instanceof Error ? error.message : "商机预测查询失败");
        setForecastDataState("error");
      });
    return () => { active = false; };
  }, [forecastPeriod, mode, forecastRefresh, scope]);

  async function loadMoreForecast() {
    if (!forecastCursor || loadingMoreForecast) return;
    setLoadingMoreForecast(true);
    setForecastPageError(null);
    try {
      const response = await fetch(`/api/crm/data?view=forecast&period=${forecastPeriod}&scope=${scope}&cursor=${encodeURIComponent(forecastCursor)}`, { cache: "no-store" });
      const data = await readCrmApi(response, "下一页预测商机查询失败") as CrmRecord;
      setForecastItems(current => mergeById(current, forecastItemsFromPayload(data)));
      setForecastCursor(nextPageCursor(data.opportunities));
    } catch (error) {
      setForecastPageError(error instanceof Error ? error.message : "下一页预测商机查询失败");
    } finally {
      setLoadingMoreForecast(false);
    }
  }

  function changeScope(nextScope: DataScope) {
    if (nextScope === scope) return;
    setCards([]);
    setPipelineCursor(null);
    setPipelinePageError(null);
    setForecastItems([]);
    setPipelineDataState("loading");
    setForecastDataState("loading");
    setForecastCursor(null);
    setForecastPageError(null);
    setPipelineError(null);
    setForecastError(null);
    setScope(nextScope);
  }

  function formatLaneAmount(items: PipelineCard[]) {
    const amount = items.reduce((sum, item) => sum + Number((item.amount || "0").replace(/[^0-9]/g, "")), 0);
    return amount ? `¥${new Intl.NumberFormat("zh-CN").format(amount)}` : "不计预测";
  }

  function reactivate(cardId: string) {
    if (pipelineDataState === "real") {
      const card = cards.find((item) => item.id === cardId);
      setLifecycleDraft({
        id: cardId, action: "reactivate", reason: "重新取得明确推进窗口", reviewDate: "",
        taskTitle: card?.nextTask || "确认重新激活后的下一动作",
        taskDueDate: new Date(writeClock + 86400000).toISOString().slice(0, 10),
      });
      setMenuId(null);
      return;
    }
    setCards((items) => items.map((item) => item.id === cardId ? { ...item, lifecycle: "active", stageAge: "刚刚重新激活", pauseReason: undefined, reviewDate: undefined, nextTask: item.nextTask || "确认重新启动后的下一动作", due: "今天" } : item));
    setMenuId(null);
  }

  async function submitLifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lifecycleDraft) return;
    const source = cards.find((item) => item.id === lifecycleDraft.id);
    if (!source) return;
    if (pipelineDataState === "real") {
      setWriteBusy(true);
      try {
        const toStatus = lifecycleDraft.action === "reactivate" ? "active" : lifecycleDraft.action === "pause" ? "paused" : "closed";
        const response = await fetch("/api/crm/actions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "opportunity-lifecycle", payload: {
            opportunityId: source.id, fromStatus: source.lifecycle, toStatus,
            reason: lifecycleDraft.reason, reviewDate: lifecycleDraft.action === "pause" ? lifecycleDraft.reviewDate : undefined,
            nextTask: lifecycleDraft.action === "reactivate" ? { title: lifecycleDraft.taskTitle, dueAt: lifecycleDraft.taskDueDate } : undefined,
            version: source.lifecycleVersion || 0,
            idempotencyKey: `opportunity-${source.id}-${toStatus}-${source.lifecycleVersion || 0}-${writeClock}`,
            source: "crm-pipeline",
          } }),
        });
        const data = await readCrmApi(response, "商机生命周期更新失败");
        const lifecycle = data.lifecycle || {};
        setCards((items) => items.map((item) => item.id === source.id ? {
          ...item, lifecycle: toStatus, lifecycleVersion: Number(lifecycle.version || item.lifecycleVersion || 0),
          pauseReason: lifecycle.reason || undefined, reviewDate: lifecycle.reviewDate || undefined,
          nextTask: lifecycle.nextTask?.title || item.nextTask,
          due: lifecycle.nextTask?.dueAt ? shortDate(lifecycle.nextTask.dueAt) : item.due,
          stageAge: toStatus === "paused" ? "刚刚暂停" : toStatus === "closed" ? "已关闭" : "刚刚重新激活",
        } : item));
        setBoardNotice(toStatus === "paused" ? "商机已暂停并设置复评日期。" : toStatus === "closed" ? "商机已关闭，事实阶段和历史记录已保留。" : "商机已重新激活，并创建下一任务。");
      } catch (error) {
        setBoardNotice(error instanceof Error ? error.message : "商机生命周期更新失败");
        setWriteBusy(false);
        return;
      }
      setWriteBusy(false);
      setLifecycleDraft(null);
      setMenuId(null);
      return;
    }
    setCards((items) => items.map((item) => item.id === lifecycleDraft.id ? {
      ...item,
      lifecycle: lifecycleDraft.action === "reactivate" ? "active" : lifecycleDraft.action === "pause" ? "paused" : "closed",
      pauseReason: lifecycleDraft.reason,
      reviewDate: lifecycleDraft.action === "pause" ? lifecycleDraft.reviewDate : undefined,
      stageAge: lifecycleDraft.action === "pause" ? "刚刚暂停" : "已关闭",
    } : item));
    setLifecycleDraft(null);
    setMenuId(null);
  }

  function requestStageMove(cardId: string, targetStage: FunnelStage) {
    const card = cards.find((item) => item.id === cardId);
    setDraggingId(null);
    setDropStage(null);
    if (!card || card.stage === targetStage) return;
    if (card.lifecycle !== "active") {
      setBoardNotice("暂停或关闭的对象需要先重新激活，才能改变事实阶段。");
      return;
    }
    if (targetStage === "lead") {
      setBoardNotice("正式商机不能退回潜客；如需停止推进，请使用暂停或关闭。");
      return;
    }
    if (pipelineDataState === "real" && !stageIds[targetStage]) {
      setBoardNotice(`销售易阶段字典中没有“${funnelStages.find((item) => item.id === targetStage)?.label}”的可写阶段，当前未提交。`);
      return;
    }
    const tomorrow = new Date(writeClock + 86400000).toISOString().slice(0, 10);
    const nextMonth = new Date(writeClock + 30 * 86400000).toISOString().slice(0, 10);
    setBoardNotice(null);
    setMoveDraft({
      id: card.id,
      targetStage,
      opportunityName: card.kind === "lead" ? `${card.customer} · ${card.product}商机` : card.title,
      contactName: "",
      evidence: "",
      nextTask: card.nextTask,
      money: card.amount ? card.amount.replace(/[^0-9.]/g, "") : "0",
      closeDate: nextMonth,
      taskDueDate: tomorrow,
      idempotencyKey: `lead-${card.id}-${targetStage}-${writeClock}`,
    });
  }

  async function submitStageMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!moveDraft) return;
    const source = cards.find((item) => item.id === moveDraft.id);
    if (!source) return;
    const converted = source.kind === "lead";
    let conversionResult: CrmRecord | null = null;
    if (pipelineDataState === "real" && converted) {
      const saleStageId = stageIds[moveDraft.targetStage];
      if (!saleStageId) return;
      setWriteBusy(true);
      try {
        const response = await fetch("/api/crm/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "convert-lead", payload: {
            leadId: source.id,
            opportunityName: moveDraft.opportunityName,
            money: Number(moveDraft.money),
            closeDate: moveDraft.closeDate,
            saleStageId,
            nextTaskTitle: moveDraft.nextTask,
            nextTaskDueDate: moveDraft.taskDueDate,
            evidence: moveDraft.evidence,
            idempotencyKey: moveDraft.idempotencyKey,
          } }),
        });
        const data = await readCrmApi(response, "潜客转化失败");
        conversionResult = data.conversion || null;
      } catch (error) {
        setBoardNotice(error instanceof Error ? error.message : "潜客转化失败；可保留当前窗口再次提交");
        setWriteBusy(false);
        return;
      }
      setWriteBusy(false);
    }
    if (pipelineDataState === "real" && !converted) {
      const saleStageId = stageIds[moveDraft.targetStage];
      if (!saleStageId) {
        setBoardNotice(`销售易阶段字典中没有“${funnelStages.find((item) => item.id === moveDraft.targetStage)?.label}”的可写阶段，当前未提交。`);
        setMoveDraft(null);
        return;
      }
      setWriteBusy(true);
      try {
        const updateResponse = await fetch("/api/crm/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update-opportunity", payload: {
            opportunityId: source.id,
            expectedUpdatedAt: source.updatedAt,
            fields: { saleStageId, updateFieldReason__c: moveDraft.evidence },
          } }),
        });
        await readCrmApi(updateResponse, "商机阶段更新失败");
        const taskResponse = await fetch("/api/crm/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create-task", payload: {
            taskName: moveDraft.nextTask,
            planFinishDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            opportunityId: source.id,
            description: `阶段进入${funnelStages.find((item) => item.id === moveDraft.targetStage)?.label}；依据：${moveDraft.evidence}`,
            taskRemark: "由商机阶段看板人工确认后生成",
          } }),
        });
        await readCrmApi(taskResponse, "阶段已更新，但下一任务创建失败");
      } catch (error) {
        setBoardNotice(error instanceof Error ? error.message : "商机阶段写回失败");
        setWriteBusy(false);
        return;
      }
      setWriteBusy(false);
    }
    setCards((items) => items.map((item) => item.id === moveDraft.id ? {
      ...item,
      id: converted && conversionResult?.opportunityId ? String(conversionResult.opportunityId) : item.id,
      accountId: converted && conversionResult?.accountId ? String(conversionResult.accountId) : item.accountId,
      kind: "opportunity",
      stage: moveDraft.targetStage,
      title: moveDraft.opportunityName,
      contact: converted ? moveDraft.contactName : item.contact,
      evidence: moveDraft.evidence,
      nextTask: moveDraft.nextTask,
      due: converted ? shortDate(moveDraft.taskDueDate) : "今天",
      stageAge: converted ? "刚刚由潜客转化" : "刚刚完成阶段校准",
      taskSource: converted ? "潜客转化" : "阶段拖拽确认",
    } : item));
    const targetLabel = funnelStages.find((stage) => stage.id === moveDraft.targetStage)?.label;
    setBoardNotice(converted ? `已把“${source.customer}”转为客户并创建商机，进入“${targetLabel}”阶段。` : `已将“${source.title}”移动到“${targetLabel}”，并记录阶段依据与下一任务。`);
    setMoveDraft(null);
  }

  async function submitNewLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newLead) return;
    setWriteBusy(true);
    try {
      const response = await fetch("/api/crm/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-lead", payload: newLead }),
      });
      const data = await readCrmApi(response, "潜客创建失败");
      const result = data.result?.data || data.result?.result || data.result || {};
      setCards((items) => [{
        id: String(result.id || `created-${Date.now()}`), kind: "lead", stage: "lead", lifecycle: "active",
        title: newLead.companyName, customer: newLead.companyName, contact: newLead.name,
        customerKind: /老师|个人/.test(newLead.companyName) ? "个体老师" : "教育机构", owner: "我", ownedByMe: true,
        product: "待首次沟通确认", evidence: newLead.customerDemand || "已通过企培 CRM 新建潜客",
        stageAge: "刚刚创建", nextTask: "完成首次联系并确认使用场景", due: "尽快", taskSource: "CRM 潜客",
      }, ...items]);
      setNewLead(null);
      setBoardNotice(`潜客“${newLead.companyName}”已写入销售易。`);
    } catch (error) {
      setBoardNotice(error instanceof Error ? error.message : "潜客创建失败");
    } finally {
      setWriteBusy(false);
    }
  }

  return <div className="page-content opportunity-page">
    <section className="page-intro opportunity-intro"><div><span className="eyebrow">客户经营全景</span><h2>从潜客到成交，用同一张事实看板推进</h2><p>页面连续展示潜客和商机；后台仍保留线索、客户与商机的数据边界。</p></div><div className="page-intro-actions"><button className="secondary-button" onClick={() => setNewLead({ name: "", companyName: "", mobile: "", customerDemand: "" })}>＋ 新建潜客</button><button className="primary-button" onClick={onCompose}>＋ 记录一次客户进展</button></div></section>

    <section className="opportunity-command panel">
      <div className="opportunity-modes" aria-label="商机工作方式">
        <button className={mode === "pipeline" ? "active" : ""} onClick={() => setMode("pipeline")}><span>▦</span> 全景阶段看板</button>
        <button className={mode === "forecast" ? "active" : ""} onClick={() => { if (mode !== "forecast") setForecastDataState("loading"); setMode("forecast"); }}><span>◫</span> 业绩与预测</button>
        <button className={mode === "lifecycle" ? "active" : ""} onClick={() => setMode("lifecycle")}><span>◌</span> 生命周期治理</button>
      </div>
      <div className="scope-actions"><ScopeSelector scope={scope} access={access} onChange={changeScope} /><div className="opportunity-facts"><span><b>{cards.filter((card) => card.kind === "lead" && card.lifecycle === "active").length}</b> 个开放潜客</span><i /><span><b>{activeOpportunities.length}</b> 个开放商机</span><i /><span><b>{pausedCount}</b> 个暂停培育</span></div></div>
    </section>

    <div className="pipeline-source-row"><span className={`data-source-badge ${pipelineDataState}`}>{pipelineDataState === "real" ? "企培 MCP 真实潜客与商机" : pipelineDataState === "loading" ? "正在读取销售漏斗" : "真实数据读取失败"}</span></div>
    {pipelineDataState === "error" && mode !== "forecast" && <DataFailure message={pipelineError || "潜客与商机查询失败"} onRetry={() => { setPipelineDataState("loading"); setPipelineError(null); setPipelineRefresh((value) => value + 1); }} />}

    {mode === "pipeline" && <>
      <section className="pipeline-summary">
        <article><span>售前客户池</span><strong>{cards.filter((card) => card.lifecycle === "active").length}</strong><small>潜客与开放商机合并查看</small></article>
        <article><span>负责人</span><strong>{new Set(cards.map((card) => card.owner)).size}</strong><small>{scope === "mine" ? "当前登录人" : "当前范围内销售"}</small></article>
        <article><span>缺少下一任务</span><strong className="warning-text">{cards.filter((card) => card.kind === "opportunity" && card.nextTask === "补充可验证的下一任务").length}</strong><small>需要补充可验证事实</small></article>
        <article><span>关键活动覆盖</span><strong>—</strong><small>等待统一活动口径</small></article>
      </section>
      <section className="pipeline-toolbar">
        <div className="segmented-filter"><button className={customerKind === "全部" ? "active" : ""} onClick={() => setCustomerKind("全部")}>全部客户</button><button className={customerKind === "教育机构" ? "active" : ""} onClick={() => setCustomerKind("教育机构")}>教育机构</button><button className={customerKind === "个体老师" ? "active" : ""} onClick={() => setCustomerKind("个体老师")}>个体老师</button></div>
        <button className={includePaused ? "pause-filter active" : "pause-filter"} onClick={() => setIncludePaused((value) => !value)}>{includePaused ? "已显示暂停客户" : `显示暂停客户（${pausedCount}）`}</button>
        <span>拖拽卡片改变阶段 · 潜客不计算销售预测</span>
      </section>
      {boardNotice && <div className="board-notice" role="status"><span>✓</span><p>{boardNotice}</p><button onClick={() => setBoardNotice(null)}>×</button></div>}
      <section className="pipeline-scroll" aria-label="潜客与商机阶段看板">
        <div className="pipeline-board">
          {funnelStages.map((stage) => {
            const stageCards = visibleCards.filter((card) => card.stage === stage.id && card.lifecycle !== "closed");
            return <section className={`pipeline-lane ${stage.tone}${dropStage === stage.id ? " is-drop-target" : ""}`} key={stage.id} onDragOver={(event) => { if (!draggingId) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropStage(stage.id); }} onDrop={(event) => { event.preventDefault(); const cardId = event.dataTransfer.getData("text/plain") || draggingId; if (cardId) requestStageMove(cardId, stage.id); }}>
              <header><div><i /><strong>{stage.label}</strong><em>{stageCards.length}</em></div><b>{stage.id === "lead" ? "不计预测" : formatLaneAmount(stageCards)}</b><small>{dropStage === stage.id ? (stage.id === "lead" ? "商机不能退回潜客" : `放开以移动到“${stage.label}”`) : stage.hint}</small></header>
              <div className="pipeline-card-list">
                {stageCards.map((card) => <article draggable={card.lifecycle === "active" && card.ownedByMe} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", card.id); setDraggingId(card.id); setBoardNotice(null); }} onDragEnd={() => { setDraggingId(null); setDropStage(null); }} className={`${card.lifecycle === "paused" ? "pipeline-card is-paused" : "pipeline-card"}${draggingId === card.id ? " is-dragging" : ""}`} key={card.id}>
                  <div className="card-topline"><span className="drag-handle" title={card.ownedByMe ? "拖拽改变阶段" : "他人负责的对象只读"} aria-hidden="true">{card.ownedByMe ? "⠿" : "◌"}</span><span className={card.kind === "lead" ? "object-pill lead" : "object-pill"}>{card.kind === "lead" ? "潜客" : card.customerKind}</span>{card.lifecycle === "paused" && <span className="paused-pill">暂停培育</span>}{card.ownedByMe ? <div className="card-menu-wrap"><button className="more-button" aria-label={`管理${card.title}生命周期`} onClick={() => setMenuId(menuId === card.id ? null : card.id)}>•••</button>{menuId === card.id && <div className="card-menu">{card.lifecycle === "paused" ? <button onClick={() => reactivate(card.id)}>重新激活并生成任务</button> : <button onClick={() => setLifecycleDraft({ id: card.id, action: "pause", reason: "客户时间窗口未确定", reviewDate: "2026-08-24" })}>暂停并设置复评日期</button>}<button className="danger" onClick={() => setLifecycleDraft({ id: card.id, action: "close", reason: "客户明确暂不推进", reviewDate: "" })}>关闭并保留原因</button></div>}</div> : <span className="read-only-pill">只读</span>}</div>
                  <h3>{card.title}</h3><p className="card-customer">{card.customer}{card.contact ? ` · ${card.contact}` : ""} · {card.owner}</p><span className="product-pill">{card.product}</span>
                  <blockquote>{card.evidence}</blockquote>
                  <div className="card-stage-meta"><span>{card.stageAge}</span>{card.amount && <strong>{card.amount}</strong>}</div>
                  {card.lifecycle === "paused" && <div className="pause-reason"><span>{card.pauseReason}</span><b>{card.reviewDate} 复评</b></div>}
                  <div className="card-task"><span>下一任务 · {card.due}</span><strong>{card.nextTask}</strong><small>{card.taskSource}</small></div>
                  {card.lifecycle === "active" && card.ownedByMe && <label className="stage-move-control"><span>{card.kind === "lead" ? "转客户并建商机" : "移动阶段"}</span><select aria-label={`移动${card.title}到其他阶段`} value="" onChange={(event) => { if (event.target.value) requestStageMove(card.id, event.target.value as FunnelStage); }}><option value="">选择阶段…</option>{funnelStages.filter((item) => item.id !== "lead" && item.id !== card.stage).map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>}
                  {card.ownedByMe ? <button className="card-action" onClick={onCompose}>{card.kind === "lead" ? "记录处理" : "记录跟进"}<span>→</span></button> : <span className="card-readonly-note">由 {card.owner} 负责</span>}
                </article>)}
                {!stageCards.length && <div className="lane-empty">当前筛选下没有客户</div>}
              </div>
            </section>;
          })}
        </div>
      </section>
      {pipelinePageError && <div className="pagination-error">{pipelinePageError}</div>}
      {pipelineCursor && <div className="pagination-bar pipeline-pagination"><span>已加载 {cards.filter(card => card.kind === "lead").length} 个潜客、{cards.filter(card => card.kind === "opportunity").length} 个商机</span><button type="button" onClick={() => void loadMorePipeline()} disabled={loadingMorePipeline}>{loadingMorePipeline ? "正在加载…" : "加载更多潜客与商机"}</button></div>}
      <p className="prototype-note"><strong>{pipelineDataState === "real" ? "当前为真实可写看板：" : "当前不可写："}</strong>{pipelineDataState === "real" ? "潜客拖拽会可恢复地创建或复用客户、创建商机和下一任务；商机拖拽会更新阶段并生成下一任务；暂停、关闭和重新激活独立于事实阶段并保留审计。" : "等待真实 CRM 数据读取成功后才能进行阶段和生命周期操作。"}</p>
    </>}

    {mode === "forecast" && <>
      <section className="forecast-strip"><div><span>{forecastPeriod === "30d" ? "未来30天目标" : "本季度目标"}</span><strong>{forecastTarget === null ? "—" : moneyLabel(forecastTarget)}</strong></div><i /><div><span>保底预测</span><strong>{moneyLabel(baseForecast)}</strong><small>{forecastTarget ? `${Math.round(baseForecast / forecastTarget * 100)}% 覆盖` : "目标口径待接入"}</small></div><div><span>最佳情况</span><strong>{moneyLabel(bestForecast)}</strong><small>{forecastTarget ? `${Math.round(bestForecast / forecastTarget * 100)}% 覆盖` : "基于当前商机"}</small></div><div className="forecast-gap"><span>目标差额</span><strong>{forecastTarget === null ? "—" : moneyLabel(Math.max(0, forecastTarget - baseForecast))}</strong><small>目标接入后计算</small></div></section>
      <section className="forecast-explanation"><strong>预测只读取开放商机</strong><span>潜客、暂停客户和没有事实依据的金额不进入预测；右侧显示当前数据来源。</span><span className={`data-source-badge ${forecastDataState}`}>{forecastDataState === "real" ? "企培 MCP 实时数据" : forecastDataState === "loading" ? "正在刷新" : "真实数据读取失败"}</span></section>
      {forecastDataState === "error" && <DataFailure message={forecastError || "商机预测查询失败"} onRetry={() => { setForecastDataState("loading"); setForecastError(null); setForecastRefresh((value) => value + 1); }} />}
      <section className="panel table-panel"><div className="filter-row"><div className="tabs"><button className={forecastPeriod === "30d" ? "active" : ""} onClick={() => { if (forecastPeriod !== "30d") { setForecastDataState("loading"); setForecastCursor(null); setForecastPeriod("30d"); } }}>未来30天</button><button className={forecastPeriod === "quarter" ? "active" : ""} onClick={() => { if (forecastPeriod !== "quarter") { setForecastDataState("loading"); setForecastCursor(null); setForecastPeriod("quarter"); } }}>本季度</button></div><div className="filter-summary">{forecastItems.length} 个开放商机 · {scope === "mine" ? "负责人：我" : "按负责人展示"}</div></div><div className="opp-table"><div className="opp-table-head"><span>商机</span><span>事实阶段</span><span>客观证据</span><span>金额</span><span>预计关闭</span><span>风险</span><span /></div>{forecastItems.map((item) => <div className="opp-row" key={item.id}><div><strong>{item.name}</strong><small>{item.customer} · {item.owner}</small></div><span className="stage-pill">{item.stage}</span><span>{item.evidence}</span><strong>{moneyLabel(item.amount)}</strong><span>{shortDate(item.closeDate)}</span><span className="risk-pill">{item.risk}</span>{item.ownedByMe ? <button onClick={onCompose}>校准</button> : <span className="read-only-pill">只读</span>}</div>)}{!forecastItems.length && <div className="empty-state">当前期间没有符合条件的开放商机。</div>}</div>{forecastPageError && <div className="pagination-error">{forecastPageError}</div>}{forecastCursor && <div className="pagination-bar"><span>已加载 {forecastItems.length} 个预测商机</span><button type="button" onClick={() => void loadMoreForecast()} disabled={loadingMoreForecast}>{loadingMoreForecast ? "正在加载…" : "加载更多预测商机"}</button></div>}</section>
    </>}

    {mode === "lifecycle" && <>
      <section className="lifecycle-overview">
        <article className="panel"><span className="eyebrow">开放池容量</span><h3>只保留值得继续投入的客户</h3><p>开放 {cards.filter((card) => card.lifecycle === "active").length} / 建议上限 12；达到上限前先处置无任务、超时和长期无反馈对象。</p><div className="capacity-meter"><i style={{ width: `${cards.filter((card) => card.lifecycle === "active").length / 12 * 100}%` }} /></div></article>
        <article className="panel"><span className="eyebrow">商机准入门槛</span><h3>潜客进入“兴趣”前必须具备</h3><div className="admission-list"><span>1. 客户主体与联系人明确</span><span>2. 产品或采购场景明确</span><span>3. 客户表达真实意愿</span><span>4. 已有负责人和下一任务</span></div></article>
      </section>
      <section className="panel lifecycle-panel"><div className="lifecycle-heading"><div><span className="eyebrow">建议规则 · 待业务共同校准</span><h3>阶段时钟和处置队列</h3><p>超时不自动判输，但必须继续、暂停或关闭，避免商机池长期失真。</p></div><div className="stage-clocks"><span><b>兴趣</b>14天</span><span><b>体验</b>7天</span><span><b>验证</b>21天</span><span><b>商务</b>30天</span></div></div>
        <div className="lifecycle-table"><div className="lifecycle-table-head"><span>健康度</span><span>客户与对象</span><span>当前阶段</span><span>最近事实</span><span>下一任务/复评</span><span>处置</span></div>{cards.filter((card) => card.kind === "opportunity" && card.lifecycle !== "closed").map((card) => <div className="lifecycle-row" key={card.id}><span className={card.lifecycle === "paused" ? "health-badge paused" : card.nextTask === "补充下一任务" ? "health-badge risk" : "health-badge healthy"}>{card.lifecycle === "paused" ? "暂停培育" : card.nextTask === "补充下一任务" ? "需处置" : "健康推进"}</span><div><strong>{card.customer}</strong><small>{card.title} · {card.amount} · {card.owner}</small></div><span>{funnelStages.find((stage) => stage.id === card.stage)?.label}<small>{card.stageAge}</small></span><p>{card.evidence}</p><div><strong>{card.nextTask}</strong><small>{card.lifecycle === "paused" ? card.reviewDate : card.due}</small></div>{card.ownedByMe ? <div className="row-actions">{card.lifecycle === "paused" ? <><button onClick={() => reactivate(card.id)}>激活</button><button onClick={() => setLifecycleDraft({ id: card.id, action: "close", reason: "客户明确暂不推进", reviewDate: "" })}>关闭</button></> : <><button onClick={onCompose}>跟进</button><button onClick={() => setLifecycleDraft({ id: card.id, action: "pause", reason: "客户时间窗口未确定", reviewDate: "2026-08-24" })}>暂停</button><button onClick={() => setLifecycleDraft({ id: card.id, action: "close", reason: "客户明确暂不推进", reviewDate: "" })}>关闭</button></>}</div> : <span className="read-only-pill">只读</span>}</div>)}</div>
      </section>
    </>}

    {lifecycleDraft && <div className="modal-backdrop" role="presentation"><form className="lifecycle-dialog" role="dialog" aria-modal="true" aria-label="商机生命周期处置" onSubmit={submitLifecycle}><header><div><span className="eyebrow">商机生命周期处置</span><h3>{lifecycleDraft.action === "reactivate" ? "重新激活并建立下一任务" : lifecycleDraft.action === "pause" ? "暂停，但保留当前事实阶段" : "关闭并保留历史原因"}</h3><p>{lifecycleDraft.action === "reactivate" ? "恢复到开放商机池，并用下一任务明确重新投入的依据。" : lifecycleDraft.action === "pause" ? "移出开放池，保留阶段、原因和重新评估时间。" : "不再进入开放池，但不会把当前事实阶段伪造成输单。"}</p></div><button type="button" onClick={() => setLifecycleDraft(null)}>×</button></header><label>处置原因<input required value={lifecycleDraft.reason} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, reason: event.target.value })} /></label>{lifecycleDraft.action === "pause" && <label>重新评估日期<input type="date" required value={lifecycleDraft.reviewDate} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, reviewDate: event.target.value })} /></label>}{lifecycleDraft.action === "reactivate" && <><label>重新激活后的下一任务<input required value={lifecycleDraft.taskTitle || ""} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, taskTitle: event.target.value })} /></label><label>任务截止日期<input type="date" required value={lifecycleDraft.taskDueDate || ""} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, taskDueDate: event.target.value })} /></label></>}<footer><button type="button" className="secondary-button" onClick={() => setLifecycleDraft(null)} disabled={writeBusy}>取消</button><button className="primary-button" type="submit" disabled={writeBusy}>{writeBusy ? "正在写入…" : "确认商机生命周期变化"}</button></footer></form></div>}
    {newLead && <div className="modal-backdrop" role="presentation"><form className="lifecycle-dialog" role="dialog" aria-modal="true" aria-label="新建企培潜客" onSubmit={submitNewLead}><header><div><span className="eyebrow">企培 CRM 写入</span><h3>新建潜客</h3><p>业务类型、负责人和企培部门由 MCP 根据当前登录人受控写入。</p></div><button type="button" onClick={() => setNewLead(null)}>×</button></header><label>机构/客户名称<input required value={newLead.companyName} onChange={(event) => setNewLead({ ...newLead, companyName: event.target.value })} /></label><label>联系人<input required value={newLead.name} onChange={(event) => setNewLead({ ...newLead, name: event.target.value })} /></label><label>手机号<input required inputMode="tel" value={newLead.mobile} onChange={(event) => setNewLead({ ...newLead, mobile: event.target.value })} /></label><label>已知需求<input value={newLead.customerDemand} onChange={(event) => setNewLead({ ...newLead, customerDemand: event.target.value })} placeholder="可选，不替客户补造需求" /></label><footer><button type="button" className="secondary-button" onClick={() => setNewLead(null)} disabled={writeBusy}>取消</button><button className="primary-button" type="submit" disabled={writeBusy}>{writeBusy ? "正在创建…" : "创建潜客"}</button></footer></form></div>}
    {moveDraft && moveSource && <div className="modal-backdrop" role="presentation"><form className="stage-move-dialog" role="dialog" aria-modal="true" aria-label={moveSource.kind === "lead" ? "潜客转客户并创建商机" : "确认商机阶段变化"} onSubmit={submitStageMove}>
      <header><div><span className="eyebrow">{moveSource.kind === "lead" ? "潜客转化确认" : "事实阶段校准"}</span><h3>{moveSource.kind === "lead" ? "转客户，并生成一条正式商机" : `移动到“${funnelStages.find((stage) => stage.id === moveDraft.targetStage)?.label}”阶段`}</h3><p>{moveSource.kind === "lead" ? "拖拽只发起转化；确认客户、联系人、事实和下一任务后才真正创建。" : "拖拽不能替代客户事实，请确认本次阶段变化的依据和下一任务。"}</p></div><button type="button" onClick={() => setMoveDraft(null)}>×</button></header>
      <div className="stage-route"><span>{moveSource.kind === "lead" ? "潜客" : funnelStages.find((stage) => stage.id === moveSource.stage)?.label}</span><b>→</b><strong>{funnelStages.find((stage) => stage.id === moveDraft.targetStage)?.label}</strong></div>
      <div className="target-stage-criteria"><span>目标阶段准入事实</span><strong>{stageMoveCriteria[moveDraft.targetStage]}</strong></div>
      {moveSource.kind === "lead" && <div className="conversion-summary"><div><span>将建立客户</span><strong>{moveSource.customer}</strong><small>{moveSource.customerKind} · 负责人 {moveSource.owner}</small></div><div><span>来源事实保留</span><strong>{moveSource.taskSource}</strong><small>原始产品方向：{moveSource.product}</small></div></div>}
      <div className="stage-move-fields">
        {moveSource.kind === "lead" && <><label>确认后的联系人<input required value={moveDraft.contactName} onChange={(event) => setMoveDraft({ ...moveDraft, contactName: event.target.value })} placeholder="姓名或明确称呼" /></label><label>商机名称<input required value={moveDraft.opportunityName} onChange={(event) => setMoveDraft({ ...moveDraft, opportunityName: event.target.value })} /></label><label>预计金额<input type="number" min="0" required value={moveDraft.money} onChange={(event) => setMoveDraft({ ...moveDraft, money: event.target.value })} /></label><label>预计关闭日期<input type="date" required value={moveDraft.closeDate} onChange={(event) => setMoveDraft({ ...moveDraft, closeDate: event.target.value })} /></label></>}
        <label className="wide">本次阶段变化依据<textarea required value={moveDraft.evidence} onChange={(event) => setMoveDraft({ ...moveDraft, evidence: event.target.value })} placeholder="填写能够满足上方准入条件的客户事实" /></label>
        <label className={moveSource.kind === "lead" ? "" : "wide"}>下一任务<input required value={moveDraft.nextTask} onChange={(event) => setMoveDraft({ ...moveDraft, nextTask: event.target.value })} placeholder="下一步要取得什么客户事实" /></label>
        {moveSource.kind === "lead" && <label>任务截止日期<input type="date" required value={moveDraft.taskDueDate} onChange={(event) => setMoveDraft({ ...moveDraft, taskDueDate: event.target.value })} /></label>}
      </div>
      {moveSource.kind === "lead" && <div className="conversion-effects"><strong>确认后一次完成</strong><span>✓ 建立或关联客户主档</span><span>✓ 保留潜客来源与跟进历史</span><span>✓ 创建商机并进入目标阶段</span><span>✓ 创建一条开放的下一任务</span></div>}
      <div className="move-guardrail">不会根据拖拽自动补造联系人、预算、客户承诺或成交概率。</div>
      <footer><button type="button" className="secondary-button" onClick={() => setMoveDraft(null)} disabled={writeBusy}>取消</button><button className="primary-button" type="submit" disabled={writeBusy}>{writeBusy ? "正在写入…" : moveSource.kind === "lead" ? "确认转客户并创建商机" : "确认阶段变化"}</button></footer>
    </form></div>}
  </div>;
}

function ActivityView({ onCompose }: { onCompose: () => void }) {
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [dataState, setDataState] = useState<"loading" | "real" | "error">("loading");
  useEffect(() => {
    let active = true;
    fetch("/api/crm/data?view=activities", { cache: "no-store" })
      .then(async (response) => {
        const data = await readCrmApi(response, "活动查询失败");
        if (active) {
          setRecords(Array.isArray(data.activities?.records) ? data.activities.records : []);
          setDataState("real");
        }
      })
      .catch(() => { if (active) setDataState("error"); });
    return () => { active = false; };
  }, []);
  const keyActivities = records.filter((record) => /拜访|体验|演示|沙龙|试用|参访/.test(String(record.content || record["entityType-label"] || "")));
  return <div className="page-content"><section className="page-intro"><div><span className="eyebrow">客户经营活动</span><h2>活动结束不是终点，客户事实才是结果</h2><p>销售活动记录工作量，关键销售活动帮助判断推进质量。</p></div><button className="primary-button" onClick={onCompose}>＋ 记录客户进展</button></section>
    <section className="metric-grid compact"><Metric label="近90天销售活动" value={dataState === "real" ? String(records.length) : "—"} detail="来源：企培 CRM 活动记录" accent="indigo" /><Metric label="关键销售活动" value={dataState === "real" ? String(keyActivities.length) : "—"} detail="拜访、体验、演示、沙龙、试用、参访" accent="green" /><Metric label="待补活动分类" value={dataState === "real" ? String(Math.max(0, records.length - keyActivities.length)) : "—"} detail="业务确认分类字典后继续校准" accent="amber" /><Metric label="数据状态" value={dataState === "real" ? "实时" : dataState === "loading" ? "读取中" : "异常"} detail="每次进入页面重新读取" accent="blue" /></section>
    <section className="panel table-panel"><div className="filter-row"><div><strong>最近客户活动</strong><small> 原始记录保留，智能整理结果附在活动内容中</small></div><span className={`data-source-badge ${dataState}`}>{dataState === "real" ? "企培 MCP 实时活动" : dataState === "loading" ? "正在读取" : "真实数据暂不可用"}</span></div><div className="activity-record-list">{records.slice(0, 30).map((record) => <article key={String(record.id)}><div><span className={/拜访|体验|演示|沙龙|试用|参访/.test(String(record.content || "")) ? "object-pill" : "object-pill lead"}>{/拜访|体验|演示|沙龙|试用|参访/.test(String(record.content || "")) ? "关键活动" : "日常活动"}</span><strong>{shortDate(record.startTime || record.createdAt)}</strong></div><p>{String(record.content || "未填写活动内容")}</p><small>活动记录 {String(record.id)} · 关联客户 {String(record.dbcRelation26 || "待关联")}</small></article>)}{dataState === "real" && !records.length && <div className="empty-state">近 90 天没有查询到活动记录。</div>}</div></section>
  </div>;
}

function InsightView() {
  const [period, setPeriod] = useState<"12m" | "quarter">("12m");
  const [payload, setPayload] = useState<InsightPayload | null>(null);
  const [dataState, setDataState] = useState<"loading" | "real" | "error">("loading");

  useEffect(() => {
    let active = true;
    fetch(`/api/crm/data?view=insights&period=${period}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await readCrmApi(response, "经营洞察查询失败");
        if (active) {
          setPayload(data);
          setDataState("real");
        }
      })
      .catch(() => { if (active) setDataState("error"); });
    return () => { active = false; };
  }, [period]);

  const records = payload?.customers?.records || [];
  const opportunityRecords = payload?.opportunities?.records || [];
  const metrics = payload?.summary?.metrics;
  const productRows = payload?.productMix?.rows || [];
  const experienceStages = payload?.experienceFunnel?.stages || [];
  const formBuckets = [
    { label: "教育机构", match: (value: string) => /机构|学校|企业/.test(value) },
    { label: "教育工作室", match: (value: string) => /工作室/.test(value) },
    { label: "个人老师", match: (value: string) => /个人|老师/.test(value) },
  ].map((bucket) => {
    const productRow = productRows.find((row) => bucket.match(String(row.customerForm || "")));
    return {
      ...bucket,
      count: Number(productRow?.customerCount ?? records.filter((record) => bucket.match(String(record.AccountTypeJJ__c || record.entityType || ""))).length),
      onlyDevice: Number(productRow?.onlyDevice || 0),
      onlyClassIn: Number(productRow?.onlyClassIn || 0),
      combined: Number(productRow?.combined || 0),
      performanceAmount: Number(productRow?.performanceAmount || 0),
    };
  });
  const classifiedCount = formBuckets.reduce((sum, item) => sum + item.count, 0);
  const activeAccounts = Number(metrics?.accountsActiveInPeriod?.count || 0);
  const accountCount = Number(metrics?.accounts?.count || records.length || 0);
  const activityCount = Number(metrics?.activityRecords?.count || payload?.activities?.records?.length || 0);
  const visitCount = Number(metrics?.visitRecords?.count || 0);
  const activeRate = accountCount ? Math.min(100, Math.round(activeAccounts / accountCount * 100)) : 0;
  const performance = Number(metrics?.performance?.total || 0);
  const formMax = Math.max(...formBuckets.map((item) => item.count), 1);
  const experienceMax = Math.max(...experienceStages.map((item) => Number(item.opportunityCount || 0)), 1);

  return <div className="page-content insight-page"><section className="page-intro"><div><span className="eyebrow">负责人原版四类洞察</span><h2>客户结构、产品组合、体验转化与活动质量</h2><p>已接入企培 MCP 的真实客户、商机、销售绩效和活动数据；缺少标准口径的指标明确标记，不用固定百分比冒充。</p></div><div className="insight-actions"><div className="tabs"><button className={period === "12m" ? "active" : ""} onClick={() => { if (period !== "12m") { setDataState("loading"); setPeriod("12m"); } }}>近12个月</button><button className={period === "quarter" ? "active" : ""} onClick={() => { if (period !== "quarter") { setDataState("loading"); setPeriod("quarter"); } }}>本季度</button></div><span className={`data-source-badge ${dataState}`}>{dataState === "real" ? "企培 MCP 实时数据" : dataState === "loading" ? "正在刷新指标" : "真实数据暂不可用"}</span></div></section>
    <section className="original-insight-grid">
      <article className="report-card panel"><div className="section-header"><div><h3>客户形态 × 产品组合</h3><p>按有效订单和订单行产品聚合，不从客户缓存字段推测</p></div><span className={`coverage-pill ${dataState === "real" ? "real" : "error"}`}>{dataState === "real" ? "真实订单" : "待数据"}</span></div><table className="matrix-table"><thead><tr><th></th><th>仅一体机</th><th>仅 ClassIn</th><th>组合客户</th></tr></thead><tbody>{formBuckets.map((item) => <tr key={item.label}><th>{item.label}<small>{dataState === "real" ? `${item.count} 个客户` : "等待 CRM 数据"}</small></th><td>{dataState === "real" ? item.onlyDevice : "—"}</td><td>{dataState === "real" ? item.onlyClassIn : "—"}</td><td>{dataState === "real" ? item.combined : "—"}</td></tr>)}</tbody></table><div className="metric-boundary real">来源：企培已归档、未作废订单及订单行；可按客户抽查订单和产品证据。</div></article>
      <article className="report-card panel"><div className="section-header"><div><h3>客户结构与收入贡献</h3><p>数量和收入分开审视，不把客户数量当作收入质量</p></div><span className={`coverage-pill ${dataState === "real" ? "real" : "error"}`}>{dataState === "real" ? "实时" : "待数据"}</span></div><div className="segment-list">{formBuckets.map((item) => <div className="segment-row" key={item.label}><span>{item.label}<br /><small>{dataState === "real" ? `${item.count} 个 · ${moneyLabel(item.performanceAmount)}` : "等待数据"}</small></span><div className="bar-track"><i style={{ width: `${Math.max(item.count ? 8 : 0, item.count / formMax * 100)}%` }} /></div><strong>{classifiedCount ? `${Math.round(item.count / Math.max(classifiedCount, 1) * 100)}%` : "—"}</strong></div>)}{classifiedCount < records.length && <div className="segment-row"><span>类型待确认<br /><small>{records.length - classifiedCount} 个客户</small></span><div className="bar-track"><i style={{ width: `${(records.length - classifiedCount) / Math.max(records.length, 1) * 100}%` }} /></div><strong>待治理</strong></div>}</div><div className="report-total"><span>同期销售绩效</span><strong>{dataState === "real" ? moneyLabel(performance || formBuckets.reduce((sum, item) => sum + item.performanceAmount, 0)) : "—"}</strong><small>客户形态收入来自企培销售绩效实收口径</small></div></article>
      <article className="report-card panel"><div className="section-header"><div><h3>体验验证转化</h3><p>按客户事实统计，不按销售主观概率</p></div><span className={`coverage-pill ${dataState === "real" ? "real" : "error"}`}>{dataState === "real" ? "里程碑快照" : "待数据"}</span></div><div className="stage-bars">{experienceStages.map((item) => <div className="stage-bar-row" key={item.key || item.label}><span>{item.label}</span><div className="bar-track"><i style={{ width: `${Number(item.opportunityCount || 0) / experienceMax * 100}%` }} /></div><strong>{Number(item.opportunityCount || 0)}</strong></div>)}{!experienceStages.length && ["已安排体验", "体验已完成", "取得反馈", "确认适配"].map((label) => <div className="stage-bar-row pending" key={label}><span>{label}</span><div className="bar-track"><i /></div><strong>—</strong></div>)}</div><div className="metric-boundary">当前读取 {opportunityRecords.length} 条期间商机。由于 CRM 尚无可查询的阶段历史，本卡只显示当前里程碑快照，不计算伪转化率。</div></article>
      <article className="report-card panel"><div className="section-header"><div><h3>活动质量</h3><p>活动量只是工作负荷，客户事实才是推进结果</p></div><span className={`coverage-pill ${dataState === "real" ? "real" : "error"}`}>{dataState === "real" ? "实时" : "待数据"}</span></div><div className="health-ring-wrap"><div className="health-ring" style={{ "--value": activeRate } as CSSProperties}><div><strong>{dataState === "real" ? `${activeRate}%` : "—"}</strong><span>期间活跃客户</span></div></div><div className="health-stats"><div className="health-stat"><span>销售活动记录</span><strong>{dataState === "real" ? activityCount : "—"}</strong></div><div className="health-stat"><span>有效拜访</span><strong>{dataState === "real" ? visitCount : "—"}</strong></div><div className="health-stat"><span>客户总数</span><strong>{dataState === "real" ? accountCount : "—"}</strong></div></div></div><div className="metric-boundary real">来源：CRM 活动记录与销售汇总；CRM 跟进活跃不等同于课耗活跃。</div></article>
    </section>
  </div>;
}

function Composer({ step, note, setNote, analysis, busy, message, customers, selectedCustomerId, setSelectedCustomerId, opportunities, selectedOpportunityId, setSelectedOpportunityId, applySuggestedStage, setApplySuggestedStage, stageCanApply, onClose, onAnalyze, onBack, onConfirm }: { step: "write" | "review" | "done"; note: string; setNote: (v: string) => void; analysis: AnalysisResult | null; busy: boolean; message: string | null; customers: CustomerOption[]; selectedCustomerId: string; setSelectedCustomerId: (id: string) => void; opportunities: OpportunityOption[]; selectedOpportunityId: string; setSelectedOpportunityId: (id: string) => void; applySuggestedStage: boolean; setApplySuggestedStage: (value: boolean) => void; stageCanApply: boolean; onClose: () => void; onAnalyze: () => void; onBack: () => void; onConfirm: () => void }) {
  const stageLabel = analysis?.suggestedStage ? funnelStages.find((stage) => stage.id === analysis.suggestedStage)?.label : null;
  return <div className="modal-backdrop" role="presentation"><section className="composer" role="dialog" aria-modal="true" aria-label="记录客户进展">
    <header><div><span className="eyebrow">一次记录 · 人工确认后写回</span><h2>{step === "write" ? "刚刚和客户发生了什么？" : step === "review" ? "请确认系统理解是否正确" : "客户活动与任务已同步"}</h2><p>{step === "write" ? "像给同事发消息一样描述即可，系统会先整理、再由你确认。" : step === "review" ? "系统只整理可见事实，不会替客户作出承诺。" : "原始记录、整理事实和下一任务已经写入销售易。"}</p></div><button className="modal-close" onClick={onClose}>×</button></header>
    {message && <div className="board-notice">{message}</div>}
    {step === "write" && <div className="compose-body"><label className="context-select"><span>关联客户</span><select aria-label="选择关联客户" value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}><option value="">请选择真实 CRM 客户</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label className="context-select opportunity-select"><span>关联商机（可选）</span><select aria-label="选择关联商机" value={selectedOpportunityId} onChange={(event) => setSelectedOpportunityId(event.target.value)}><option value="">只更新客户并把任务关联到客户</option>{opportunities.map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.name}</option>)}</select><small>{opportunities.length ? "选择后，下一任务会直接归属该商机；阶段仍需在下一步单独确认。" : "该客户当前没有可见的企培商机。"}</small></label><div className="note-box"><textarea value={note} onChange={(e) => setNote(e.target.value)} aria-label="客户进展内容" placeholder="例如：王校长确认演示效果，准备先采购6台，希望下周收到报价……" /><div><span>支持粘贴企微、拜访或面聊记录</span><span>{note.length} 字</span></div></div><div className="quick-prompts"><span>也可以快速补充：</span><button onClick={() => setNote(note + " 客户已确认使用场景。")}>客户承诺</button><button onClick={() => setNote(note + " 体验结果已确认。")}>体验结果</button><button onClick={() => setNote(note + " 下一步需要提交报价。")}>下一步</button></div><div className="compose-tip"><span>✦</span><p><strong>系统会尝试整理</strong>客户事实、产品与数量、商机阶段依据以及下一任务。未配置模型时会明确使用本地规则分析。</p></div></div>}
    {step === "review" && analysis && <div className="review-body"><div className="source-note"><span>客户原始记录 · 分析来源 {analysis.provider}</span><p>{note}</p></div><div className="change-section"><header><h3>识别出的客户事实</h3><span>{analysis.facts.length} 项</span></header>{analysis.facts.map((fact, index) => <div className="change-row" key={`${fact.type}-${index}`}><i className="change-mark green">✓</i><div><span>{fact.type}</span><strong>{fact.value}</strong><small>{fact.evidence ? `依据：${fact.evidence}` : "来源：本次客户沟通"}</small></div></div>)}</div><div className="change-section"><header><h3>建议联动</h3><span>2 项</span></header><div className="change-row"><i className="change-mark amber">机</i><div><span>商机阶段建议</span><strong>{stageLabel || "暂不变更阶段"}</strong><small>{analysis.stageReason}</small>{selectedOpportunityId && analysis.suggestedStage && <label className="stage-confirm"><input type="checkbox" checked={applySuggestedStage} disabled={!stageCanApply} onChange={(event) => setApplySuggestedStage(event.target.checked)} /><span>{stageCanApply ? "我确认把所选商机同步到该阶段" : "销售易阶段字典中没有安全映射，暂不写入"}</span></label>}</div></div><div className="change-row"><i className="change-mark indigo">任</i><div><span>下一任务建议</span><strong>{analysis.nextTask.title}</strong><small>目标事实：{analysis.nextTask.targetFact}</small></div></div></div>{analysis.warnings?.map((warning) => <div className="guardrail" key={warning}>{warning}</div>)}<div className="guardrail">确认后会以同一写入编号创建活动与下一任务；失败后可直接重试，不会重复创建已完成步骤。只有选择具体商机并勾选确认时，才会同步阶段。</div></div>}
    {step === "done" && <div className="done-state"><span>✓</span><h3>活动记录和下一任务已写入</h3><p>原始沟通、识别事实和下一任务已同步销售易；商机阶段建议保留给销售在具体商机上确认。</p></div>}
    {step !== "done" && <footer>{step === "review" ? <button className="secondary-button" onClick={onBack} disabled={busy}>返回修改</button> : <button className="secondary-button" onClick={onClose} disabled={busy}>取消</button>}<button className="primary-button" onClick={step === "write" ? onAnalyze : onConfirm} disabled={busy || !note.trim() || !selectedCustomerId}>{busy ? "正在处理…" : step === "write" ? "✦ 智能整理本次进展" : "确认并写入活动与任务"}</button></footer>}
  </section></div>;
}
