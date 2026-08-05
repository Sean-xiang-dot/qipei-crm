import { NextRequest, NextResponse } from "next/server";
import { crmSessionToken } from "../../../lib/crm-mcp";

export const dynamic = "force-dynamic";

type SuggestedStage = "interest" | "experience" | "validation" | "commercial" | null;

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
    warnings: ["当前使用本地规则分析；配置 AI_ANALYSIS_URL 后可切换为模型分析。所有建议仍需人工确认。"],
  };
}

async function modelAnalysis(note: string, context: Record<string, unknown>) {
  const url = process.env.AI_ANALYSIS_URL?.trim();
  const apiKey = process.env.AI_ANALYSIS_API_KEY?.trim();
  if (!url || !apiKey) return null;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.AI_ANALYSIS_MODEL || "gpt-5-mini",
      input: [
        { role: "system", content: "你是企培CRM销售活动分析器。只提取原文可验证事实，不补造预算、承诺或日期。返回JSON，字段为 facts、suggestedStage、stageReason、nextTask、warnings。suggestedStage只能是interest、experience、validation、commercial或null。" },
        { role: "user", content: JSON.stringify({ note, context }) },
      ],
      response_format: { type: "json_object" },
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`AI 分析服务返回 ${response.status}`);
  const data = await response.json();
  const text = data.output_text || data.output?.[0]?.content?.[0]?.text || data.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI 分析服务未返回结构化结果");
  return { provider: process.env.AI_ANALYSIS_MODEL || "configured-model", ...JSON.parse(text) };
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
