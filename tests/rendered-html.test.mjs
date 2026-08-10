import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("keeps enterprise CRM identity and MCP authentication explicit", async () => {
  const [layout, page, authStatus] = await Promise.all([
    source("app/layout.tsx"),
    source("app/page.tsx"),
    source("app/api/crm-auth/status/route.ts"),
  ]);

  assert.match(layout, /企培 CRM｜销售经营平台/);
  assert.match(page, /使用 CRM 账号登录/);
  assert.match(page, /不使用 ChatGPT 账号作为业务身份/);
  assert.match(page, /Enterprise Training CRM MCP/);
  assert.match(authStatus, /CRM_SESSION_COOKIE/);
  assert.doesNotMatch(`${layout}\n${page}`, /澄明|chengming/i);
});

test("connects the first usable CRM loop through server-side routes", async () => {
  const [page, dataRoute, actionRoute, analyzeRoute] = await Promise.all([
    source("app/page.tsx"),
    source("app/api/crm/data/route.ts"),
    source("app/api/crm/actions/route.ts"),
    source("app/api/crm/analyze/route.ts"),
  ]);

  for (const view of ["tasks", "pipeline", "customers", "activities", "insights"]) {
    assert.match(dataRoute, new RegExp(`view === ["']${view}["']`));
  }
  assert.match(dataRoute, /customer-product-mix/);
  assert.match(dataRoute, /experience-funnel/);
  assert.match(dataRoute, /opportunity-stages/);
  assert.match(actionRoute, /customer-lifecycle/);
  assert.match(actionRoute, /create-activity/);
  assert.match(actionRoute, /create-task/);
  assert.match(actionRoute, /update-task/);
  assert.match(actionRoute, /confirm-followup/);
  assert.match(dataRoute, /api\/tasks/);
  assert.match(dataRoute, /weekly-actions/);
  assert.match(actionRoute, /create-opportunity/);
  assert.match(actionRoute, /update-opportunity/);
  assert.match(actionRoute, /create-lead/);
  assert.match(actionRoute, /convert-lead/);
  assert.match(actionRoute, /opportunity-lifecycle/);
  assert.match(dataRoute, /api\/opportunity-lifecycle/);
  assert.match(analyzeRoute, /所有建议仍需人工确认/);
  assert.match(page, /潜客.*兴趣.*体验.*验证.*商务推进/s);
  assert.match(page, /商机拖拽会更新阶段并生成下一任务/);
  assert.match(page, /潜客拖拽会可恢复地创建或复用客户、创建商机和下一任务/);
  assert.match(page, /暂停、关闭和重新激活独立于事实阶段并保留审计/);
  assert.match(page, /销售易真实任务 \+ 企培规则建议/);
  assert.match(page, /已经存在于销售易，可完成或延期/);
  assert.match(page, /人工确认后才生成任务/);
  assert.match(page, /规则来源：/);
  assert.match(page, /候选编号：/);
  assert.match(page, /candidateKey/);
  assert.match(page, /数仓使用规则/);
  assert.match(page, /opportunity\.opportunityId/);
  assert.match(page, /associationType: leadId \? "lead" : opportunityId \? "opportunity" : "account"/);
  assert.match(page, /\{ leadId: task\.associationId \}/);
  assert.match(page, /失败后可直接重试，不会重复创建已完成步骤/);
  assert.match(page, /选择具体商机并勾选确认时，才会同步阶段/);
  assert.match(dataRoute, /cursorQuery/);
  assert.match(dataRoute, /limit=50/);
  assert.match(page, /加载更多客户/);
  assert.match(page, /加载更多潜客与商机/);
  assert.match(page, /加载更多预测商机/);
});

test("derives page scope from CRM user role facts instead of user allowlists", async () => {
  const [access, dataRoute, envExample, readme] = await Promise.all([
    source("app/lib/crm-access.ts"),
    source("app/api/crm/data/route.ts"),
    source(".env.example"),
    source("README.md"),
  ]);

  assert.match(access, /identity\.accessFacts/);
  assert.match(access, /事业部负责人/);
  assert.match(access, /销售主管/);
  assert.match(dataRoute, /resolveCrmAccess/);
  assert.doesNotMatch(`${access}\n${dataRoute}\n${envExample}\n${readme}`, /CRM_MANAGER_USER_IDS|CRM_DIRECTOR_USER_IDS/);
});
