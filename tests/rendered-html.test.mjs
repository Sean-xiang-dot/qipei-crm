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
  assert.match(actionRoute, /create-opportunity/);
  assert.match(actionRoute, /update-opportunity/);
  assert.match(actionRoute, /create-lead/);
  assert.match(analyzeRoute, /所有建议仍需人工确认/);
  assert.match(page, /潜客.*兴趣.*体验.*验证.*商务推进/s);
  assert.match(page, /商机拖拽会在确认事实后更新阶段并创建下一任务/);
  assert.match(page, /潜客转客户和商机生命周期仍等待独立事务接口/);
});
