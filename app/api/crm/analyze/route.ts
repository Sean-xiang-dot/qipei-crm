import { NextRequest, NextResponse } from "next/server";
import { crmSessionToken } from "../../../lib/crm-mcp";

export const dynamic = "force-dynamic";

type SuggestedStage = "interest" | "experience" | "validation" | "commercial" | null;

type AnalysisResult = {
  provider: string;
  facts: Array<{ type: string; value: string; confidence?: number; evidence?: string }>;
  suggestedStage: SuggestedStage;
  stageReason: string;
  nextTask: { title: string; dueDate: string | null; targetFact: string };
  warnings: string[];
};

const suggestedStages = new Set<Exclude<SuggestedStage, null>>(["interest", "experience", "validation", "commercial"]);

function textValue(value: unknown, fallback = "", limit = 1000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

function parseJsonObject(value: string): Record<string, unknown> {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI 分析结果不是 JSON 对象");
  return parsed as Record<string, unknown>;
}

function normalizeModelResult(value: Record<string, unknown>, provider: string): AnalysisResult {
  const rawFacts = Array.isArray(value.facts) ? value.facts : [];
  const facts = rawFacts.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const fact = item as Record<string, unknown>;
    const type = textValue(fact.type, "客户事实", 40);
    const factValue = textValue(fact.value, "", 1000);
    if (!factValue) return [];
    const confidence = typeof fact.confidence === "number" ? Math.max(0, Math.min(1, fact.confidence)) : undefined;
    return [{ type, value: factValue, confidence, evidence: textValue(fact.evidence, "", 1000) || undefined }];
  }).slice(0, 12);

  if (!facts.length) throw new Error("AI 分析服务未返回可验证客户事实");

  const rawStage = typeof value.suggestedStage === "string" ? value.suggestedStage : null;
  const suggestedStage = rawStage && suggestedStages.has(rawStage as Exclude<SuggestedStage, null>)
    ? rawStage as Exclude<SuggestedStage, null>
    : null;
  const rawTask = value.nextTask && typeof value.nextTask === "object" && !Array.isArray(value.nextTask)
    ? value.nextTask as Record<string, unknown>
    : {};
  const title = textValue(rawTask.title, "确认客户下一步安排并取得新的客户事实", 200);
  const targetFact = textValue(rawTask.targetFact, "取得下一项可验证客户事实", 300);
  const dueDate = textValue(rawTask.dueDate, "", 30) || null;
  const warnings = (Array.isArray(value.warnings) ? value.warnings : [])
    .map((item) => textValue(item, "", 300))
    .filter(Boolean)
    .slice(0, 6);

  return {
    provider,
    facts,
    suggestedStage,
    stageReason: textValue(value.stageReason, suggestedStage ? "模型根据本次记录建议调整阶段" : "没有足够事实建议变更商机阶段", 500),
    nextTask: { title, dueDate, targetFact },
    warnings: [...warnings, "模型建议必须由销售确认后才会写回 CRM。"],
  };
}

function extractQuantity(note: string): string | null {
  const match = note.match(/(\d+)\s*(台|个账号|账号|间教室|个教室)/);
  return match ? `${match[1]} ${match[2]}` : null;
}

function inferStage(note: string): { stage: SuggestedStage; reason: string } {
  if (/报价|合同|付款|采购|签约|回款/.test(note)) return { stage: "commercial", reason: "记录中出现报价、合同、付款或明确采购事实" };
  if (/适配|验证通过|效果符合|认可.*效果|反馈.*符合/.test(note)) return { stage: "validation", reason: "记录中出现实际反馈或适配结论" };
  if (/体验|试用|演示|样机/.test(note)) return { stage: "experience", reason: "记录中出现体验、试用、演示或样机事实" };
  if (/兴趣|了解|咨询|需求|场景/.test(note)) return { stage: "interest", reason: "记录中出现明确兴趣、需求或使用场景" };
  return { stage: null, reason: "没有足够事实建议变更商机阶段" };
}

function inferNextTask(note: string, stage: SuggestedStage) {
  const explicit = note.match(/(?:下一步|计划|需要|我会|我将在|周[一二三四五六日天]前|今天|明天|后天)[，,:：\s]*([^。；;]+)/);
  if (explicit?.[1]) return explicit[1].trim();
  if (/报价/.test(note)) return "提交报价并取得客户对价格与付款安排的反馈";
  if (/合同|签约/.test(note)) return "确认合同条款、签署人和计划签约时间";
  if (stage === "validation") return "确认客户最终适配结论和采购安排";
  if (stage === "experience") return "确认体验时间、参与人员和反馈标准";
  if (stage === "interest") return "确认联系人、使用场景和下一次沟通时间";
  return "确认客户下一步安排并取得新的客户事实";
}

function rulesAnalysis(note: string) {
  const stage = inferStage(note);
  const quantity = extractQuantity(note);
  const facts = [
    { type: "沟通事实", value: note, confidence: 1, evidence: note },
  ];
  if (quantity) facts.push({ type: "数量", value: quantity, confidence: 0.98, evidence: quantity });
  if (/确认|认可|同意|准备|希望/.test(note)) {
    facts.push({ type: "客户意向", value: "客户表达了明确反馈或后续意向", confidence: 0.8, evidence: note });
  }
  return {
    provider: "rules-v1",
    facts,
    suggestedStage: stage.stage,
    stageReason: stage.reason,
    nextTask: {
      title: inferNextTask(note, stage.stage),
      dueDate: null,
      targetFact: stage.stage === "commercial" ? "客户确认报价、合同或付款安排" : "取得下一项可验证客户事实",
    },
    warnings: ["当前使用本地规则分析；配置 DeepSeek 或通用 AI 分析服务后可切换为模型分析。所有建议仍需人工确认。"],
  };
}

async function modelAnalysis(note: string, context: Record<string, unknown>) {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  const useDeepSeek = provider === "deepseek" || Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  const genericUrl = process.env.AI_ANALYSIS_URL?.trim();
  const genericApiKey = process.env.AI_ANALYSIS_API_KEY?.trim();
  if (!useDeepSeek && !genericUrl && !genericApiKey) return null;

  let url: string;
  let apiKey: string;
  let model: string;
  let requestBody: Record<string, unknown>;

  const instruction = "你是企培 CRM 销售活动分析器。只提取原文可验证事实，不补造预算、承诺或日期。必须返回 JSON 对象，字段为 facts、suggestedStage、stageReason、nextTask、warnings。facts 每项包含 type、value、confidence、evidence；nextTask 包含 title、dueDate、targetFact；suggestedStage 只能是 interest、experience、validation、commercial 或 null。示例：{\"facts\":[{\"type\":\"客户意向\",\"value\":\"客户同意安排体验\",\"confidence\":0.9,\"evidence\":\"原文证据\"}],\"suggestedStage\":\"experience\",\"stageReason\":\"已确认体验安排\",\"nextTask\":{\"title\":\"确认体验时间\",\"dueDate\":null,\"targetFact\":\"取得体验参与人和时间\"},\"warnings\":[]}";

  if (useDeepSeek) {
    apiKey = process.env.DEEPSEEK_API_KEY?.trim() || "";
    const baseUrl = (process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/+$/, "");
    if (!apiKey) throw new Error("DeepSeek API Key 未配置");
    url = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
    model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
    requestBody = {
      model,
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: JSON.stringify({ note, context }) },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      max_tokens: 1400,
    };
  } else {
    if (!genericUrl || !genericApiKey) throw new Error("通用 AI 分析服务配置不完整");
    url = genericUrl;
    apiKey = genericApiKey;
    model = process.env.AI_ANALYSIS_MODEL?.trim() || "configured-model";
    requestBody = {
      model,
      input: [
        { role: "system", content: instruction },
        { role: "user", content: JSON.stringify({ note, context }) },
      ],
      response_format: { type: "json_object" },
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody),
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`AI 分析服务返回 ${response.status}`);
  const data = await response.json();
  const text = data.output_text || data.output?.[0]?.content?.[0]?.text || data.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI 分析服务未返回结构化结果");
  return normalizeModelResult(parseJsonObject(String(text)), model);
}

export async function POST(request: NextRequest) {
  if (!await crmSessionToken()) return NextResponse.json({ error: "未登录 CRM" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const note = String(body.note || "").trim();
  if (note.length < 5) return NextResponse.json({ error: "请至少输入 5 个字的客户进展" }, { status: 400 });
  if (note.length > 12000) return NextResponse.json({ error: "单次记录不能超过 12000 字" }, { status: 400 });

  try {
    const model = await modelAnalysis(note, body.context || {});
    return NextResponse.json(model || rulesAnalysis(note));
  } catch (error) {
    const fallback = rulesAnalysis(note);
    return NextResponse.json({ ...fallback, warnings: [...fallback.warnings, `模型分析暂不可用：${error instanceof Error ? error.message : "未知错误"}`] });
  }
}
