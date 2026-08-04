"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

type View = "workbench" | "tasks" | "customers" | "opportunities" | "activities" | "insights";

const navigation: { id: View; label: string; mark: string; badge?: string }[] = [
  { id: "workbench", label: "今日工作台", mark: "今" },
  { id: "tasks", label: "任务中心", mark: "任", badge: "8" },
  { id: "customers", label: "客户", mark: "客" },
  { id: "opportunities", label: "商机", mark: "机", badge: "3" },
  { id: "activities", label: "销售活动", mark: "活" },
  { id: "insights", label: "经营洞察", mark: "析" },
];

const initialTasks = [
  { id: 1, time: "10:30", urgency: "overdue", customer: "启航教育集团", title: "取得一体机演示后的校长确认", fact: "实际课堂适配结论", reason: "演示已完成 2 天，仍缺客户反馈", source: "体验验证", owner: "我", action: "记录反馈" },
  { id: 2, time: "14:00", urgency: "today", customer: "晨星素质教育", title: "完成新线索首次联系", fact: "联系人、教室数量与升级计划", reason: "线上咨询进入 4 小时首响窗口", source: "线索自动化", owner: "我", action: "记录处理" },
  { id: 3, time: "16:00", urgency: "today", customer: "知行语言中心", title: "判断 ClassIn 是否有真实场景", fact: "异地教师联合授课频率", reason: "客户新增教室并提到异地授课", source: "产品机会", owner: "我", action: "记录判断" },
  { id: 4, time: "明天", urgency: "later", customer: "星河美术工作室", title: "确认暑期体验课时间", fact: "体验日期与参与老师", reason: "客户已同意体验，但尚未排期", source: "商机下一步", owner: "我", action: "开始跟进" },
];

const customers = [
  { name: "启航教育集团", form: "教育机构", city: "上海", owner: "顾然", products: "一体机 · ClassIn", next: "今天 10:30", health: "待反馈", tone: "amber" },
  { name: "晨星素质教育", form: "新线索", city: "上海", owner: "顾然", products: "一体机", next: "今天 14:00", health: "待首响", tone: "red" },
  { name: "知行语言中心", form: "教育机构", city: "苏州", owner: "顾然", products: "一体机", next: "今天 16:00", health: "机会判断", tone: "violet" },
  { name: "星河美术工作室", form: "教育工作室", city: "杭州", owner: "顾然", products: "ClassIn", next: "明天", health: "体验排期", tone: "blue" },
];

const opportunities = [
  { name: "6 间教室升级", customer: "启航教育集团", stage: "体验验证", amount: "¥168,000", evidence: "演示已完成，待校长反馈", next: "今天", risk: "待客户反馈" },
  { name: "ClassIn 账号扩容", customer: "启航教育集团", stage: "商务推进", amount: "¥32,000", evidence: "确认新增 80 个账号", next: "8月8日", risk: "证据完整" },
  { name: "暑期线上课方案", customer: "星河美术工作室", stage: "兴趣确认", amount: "¥12,000", evidence: "同意开通体验账号", next: "明天", risk: "待安排体验" },
];

type OpportunityMode = "pipeline" | "forecast" | "lifecycle";
type FunnelStage = "lead" | "interest" | "experience" | "validation" | "commercial";
type LifecycleStatus = "active" | "paused" | "closed";
type CustomerKind = "教育机构" | "个体老师";

type PipelineCard = {
  id: string;
  kind: "lead" | "opportunity";
  stage: FunnelStage;
  lifecycle: LifecycleStatus;
  title: string;
  customer: string;
  contact?: string;
  customerKind: CustomerKind;
  owner: string;
  product: string;
  evidence: string;
  stageAge: string;
  amount?: string;
  nextTask: string;
  due: string;
  taskSource: string;
  pauseReason?: string;
  reviewDate?: string;
};

type StageMoveDraft = {
  id: string;
  targetStage: Exclude<FunnelStage, "lead">;
  opportunityName: string;
  contactName: string;
  evidence: string;
  nextTask: string;
};

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

const initialPipelineCards: PipelineCard[] = [
  { id: "lead-1", kind: "lead", stage: "lead", lifecycle: "active", title: "晨星素质教育", customer: "晨星素质教育", customerKind: "教育机构", owner: "顾然", product: "教学一体机", evidence: "计划升级 3 间教室，咨询演示和安装条件", stageAge: "新线索 · 2 小时", nextTask: "完成首次联系并确认联系人", due: "今天 14:00", taskSource: "线索自动化" },
  { id: "lead-2", kind: "lead", stage: "lead", lifecycle: "active", title: "蒋老师少儿英语", customer: "蒋老师", customerKind: "个体老师", owner: "顾然", product: "ClassIn", evidence: "沙龙报名时提到线上小班课和课后回放", stageAge: "已触达 1 次", nextTask: "再次联系并确认开课计划", due: "今天 16:00", taskSource: "活动转化" },
  { id: "opp-1", kind: "opportunity", stage: "interest", lifecycle: "active", title: "暑期线上课方案", customer: "星河美术工作室", customerKind: "教育机构", owner: "顾然", product: "ClassIn · 5 账号", evidence: "客户希望暑期增加线上美术课，已同意了解方案", stageAge: "停留 1 天", amount: "¥12,000", nextTask: "预约 ClassIn 体验课", due: "明天", taskSource: "商机下一步" },
  { id: "opp-2", kind: "opportunity", stage: "interest", lifecycle: "paused", title: "秋季录播教室计划", customer: "星河美术工作室", customerKind: "教育机构", owner: "顾然", product: "教学一体机 · 2 台", evidence: "秋季课程尚未定班，采购窗口需要重新确认", stageAge: "暂停 24 天", amount: "¥26,000", nextTask: "到期重新评估采购窗口", due: "8月24日", taskSource: "生命周期规则", pauseReason: "课程排期未确定", reviewDate: "2026-08-24" },
  { id: "opp-3", kind: "opportunity", stage: "experience", lifecycle: "active", title: "直播教室设备补充", customer: "云帆在线教育", customerKind: "教育机构", owner: "陈放", product: "教学一体机 · 4 台", evidence: "已确认下周寄送样机，运营和主讲老师共同试用", stageAge: "已安排 · 停留 4 天", amount: "¥92,000", nextTask: "确认样机收货与试用老师名单", due: "今天", taskSource: "体验规则" },
  { id: "opp-4", kind: "opportunity", stage: "validation", lifecycle: "active", title: "6 间教室升级", customer: "启航教育集团", customerKind: "教育机构", owner: "顾然", product: "教学一体机 · 6 台", evidence: "演示已完成，等待校长确认实际课堂适配结果", stageAge: "待反馈 · 停留 2 天", amount: "¥168,000", nextTask: "取得校长对演示效果的确认", due: "今天 10:30", taskSource: "拜访报告 AI" },
  { id: "opp-5", kind: "opportunity", stage: "commercial", lifecycle: "active", title: "ClassIn 账号扩容", customer: "启航教育集团", customerKind: "教育机构", owner: "顾然", product: "ClassIn · 80 账号", evidence: "校长确认新增 80 个账号，等待财务确认付款排期", stageAge: "停留 1 天", amount: "¥32,000", nextTask: "确认扩容付款排期", due: "8月8日", taskSource: "商机下一步" },
  { id: "opp-6", kind: "opportunity", stage: "commercial", lifecycle: "active", title: "个人教学空间升级", customer: "林老师", customerKind: "个体老师", owner: "林溪", product: "教学一体机 · 1 台", evidence: "确认设备适合个人工作室，正在比较分期方案", stageAge: "停留 3 天", amount: "¥19,800", nextTask: "补充下一任务", due: "需处置", taskSource: "生命周期规则" },
];

export default function Home() {
  const [auth, setAuth] = useState<{ state: "loading" | "anonymous" | "authorizing" | "authenticated" | "error"; userId?: string; userName?: string; message?: string }>({ state: "loading" });
  const [view, setView] = useState<View>("workbench");
  const [taskTab, setTaskTab] = useState("待我处理");
  const [tasks, setTasks] = useState(initialTasks);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composeStep, setComposeStep] = useState<"write" | "review" | "done">("write");
  const [note, setNote] = useState("王校长确认一体机演示效果符合预期，准备先采购6台，希望下周收到正式报价。周五前我提交报价单。");

  const title = navigation.find((item) => item.id === view)?.label ?? "今日工作台";
  const visibleTasks = useMemo(() => taskTab === "全部任务" ? tasks : taskTab === "已完成" ? [] : tasks, [taskTab, tasks]);

  useEffect(() => {
    fetch("/api/crm-auth/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setAuth(data.authenticated ? { state: "authenticated", ...data.session } : { state: "anonymous" }))
      .catch(() => setAuth({ state: "error", message: "暂时无法连接企培 CRM MCP" }));
  }, []);

  async function startCrmLogin() {
    setAuth({ state: "authorizing" });
    try {
      const response = await fetch("/api/crm-auth/start", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法启动 CRM 登录");
      const loginWindow = window.open(data.authorizeUrl, "crm-oauth", "popup=yes,width=760,height=760");
      if (!loginWindow) window.location.href = data.authorizeUrl;
      for (let attempt = 0; attempt < 150; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1600));
        const poll = await fetch(`/api/crm-auth/poll?loginId=${encodeURIComponent(data.loginId)}`, { cache: "no-store" });
        const result = await poll.json();
        if (!poll.ok) throw new Error(result.error || "CRM 登录失败");
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

  function finishTask(id: number) {
    setTasks((items) => items.filter((item) => item.id !== id));
  }

  function openComposer() {
    setComposeStep("write");
    setComposerOpen(true);
  }

  function confirmUpdate() {
    setComposeStep("done");
    setTimeout(() => setComposerOpen(false), 1400);
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
          <div className="focus-head"><span>本周推进</span><strong>68%</strong></div>
          <div className="focus-meter"><i /></div>
          <p>18 项事实任务已完成 12 项</p>
        </section>
        <div className="profile"><span className="avatar">{displayName.slice(0, 1)}</span><div><strong>{displayName}</strong><small>企业培训事业部 · CRM 已认证</small></div><button aria-label="退出 CRM" title="退出 CRM" onClick={logout}>退出</button></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="breadcrumb">销售经营 / {title}</p><h1>{title}</h1></div>
          <div className="top-actions"><label className="search"><span>⌕</span><input aria-label="搜索" placeholder="搜索客户、联系人或商机" /></label><button className="notification" aria-label="通知">◌<i /></button><button className="primary-button" onClick={openComposer}><span>＋</span> 记录客户进展</button></div>
        </header>

        {view === "workbench" && <Workbench userName={displayName} tasks={tasks} onCompose={openComposer} onFinish={finishTask} onJump={setView} />}
        {view === "tasks" && <TaskCenter tasks={visibleTasks} tab={taskTab} setTab={setTaskTab} onFinish={finishTask} onCompose={openComposer} />}
        {view === "customers" && <CustomerList onCompose={openComposer} />}
        {view === "opportunities" && <OpportunityList onCompose={openComposer} />}
        {view === "activities" && <ActivityView />}
        {view === "insights" && <InsightView />}
      </section>

      {composerOpen && <Composer step={composeStep} note={note} setNote={setNote} onClose={() => setComposerOpen(false)} onAnalyze={() => setComposeStep("review")} onBack={() => setComposeStep("write")} onConfirm={confirmUpdate} />}
    </main>
  );
}

function CrmLogin({ state, message, onLogin }: { state: "loading" | "anonymous" | "authorizing" | "error"; message?: string; onLogin: () => void }) {
  return <main className="login-shell"><section className="login-panel"><div className="login-brand"><span>CRM</span><div><strong>企培 CRM</strong><small>企业培训销售经营平台</small></div></div><div className="login-visual"><i /><i /><i /><span><b>企培</b><small>CRM</small></span></div><div className="login-copy"><span className="eyebrow">企业培训事业部</span><h1>用你的 CRM 身份<br />进入销售经营平台</h1><p>系统通过企培 CRM MCP 完成销售易 OAuth 授权。每个人使用自己的 CRM 权限，客户和商机数据范围不会越过企培组织边界。</p><div className="login-security"><div><b>01</b><span><strong>CRM 原生身份</strong><small>不使用 ChatGPT 账号作为业务身份</small></span></div><div><b>02</b><span><strong>会话安全隔离</strong><small>Token 仅保存在 HttpOnly 会话中</small></span></div><div><b>03</b><span><strong>企培数据边界</strong><small>查询与写回均由 MCP 服务端校验</small></span></div></div>{state === "loading" ? <button className="crm-login-button" disabled><i />正在检查 CRM 登录状态…</button> : state === "authorizing" ? <button className="crm-login-button" disabled><i className="spinner" />请在新窗口完成销售易授权</button> : <button className="crm-login-button" onClick={onLogin}>使用 CRM 账号登录 <span>→</span></button>}{state === "error" && <div className="login-error">{message}<button onClick={onLogin}>重新尝试</button></div>}<small className="login-footnote">认证服务：Enterprise Training CRM MCP · 销售易 OAuth</small></div></section></main>;
}

function Workbench({ userName, tasks, onCompose, onFinish, onJump }: { userName: string; tasks: typeof initialTasks; onCompose: () => void; onFinish: (id: number) => void; onJump: (view: View) => void }) {
  return <div className="page-content dashboard-page">
    <section className="morning-brief">
      <div><span className="eyebrow">星期一 · 8月3日</span><h2>早上好，{userName}。<br />今天先拿到 <b>3 个客户事实</b>。</h2><p>系统已按时效、客户承诺和商机风险排好顺序。你只需要从第一项开始。</p><div className="brief-actions"><button className="primary-button light" onClick={onCompose}>记录一段客户进展</button><button className="text-button" onClick={() => onJump("tasks")}>查看今日完整安排 →</button></div></div>
      <div className="brief-score"><div className="score-ring"><strong>4</strong><span>需优先处理</span></div><small>其中 1 项已逾期</small></div>
    </section>

    <section className="metric-grid">
      <Metric label="今日事实任务" value="8" detail="4 项需客户反馈" accent="indigo" />
      <Metric label="30天承诺预测" value="¥19.8万" detail="较目标还差 ¥10.2万" accent="blue" />
      <Metric label="体验待反馈" value="3" detail="最长已等待 2 天" accent="amber" />
      <Metric label="开放商机健康度" value="76%" detail="2 个商机需要处置" accent="green" />
    </section>

    <div className="content-grid">
      <section className="panel priority-panel">
        <PanelHeading eyebrow="按事实排序" title="现在最值得做" subtitle="每项任务都说明原因和需要取得的结果" action="查看全部" onAction={() => onJump("tasks")} />
        <div className="priority-list">{tasks.slice(0, 3).map((task, index) => <PriorityTask key={task.id} task={task} index={index + 1} onFinish={onFinish} />)}</div>
      </section>
      <aside className="panel ai-guide">
        <div className="ai-heading"><span className="ai-orb">✦</span><div><span className="eyebrow">今日智能简报</span><h3>先处理体验反馈，再补预测缺口</h3></div></div>
        <p>启航教育的演示结果会直接影响 16.8 万元商机是否进入“最佳情况”。这是今天最有价值的一次沟通。</p>
        <div className="guide-block"><span>建议询问</span><strong>“实际课堂使用中，老师和学生最认可、最担心的分别是什么？”</strong></div>
        <button className="guide-action" onClick={onCompose}>带着建议记录跟进 <span>→</span></button>
        <small>依据：体验状态、预计首款日期与下一任务综合判断</small>
      </aside>
    </div>

    <div className="content-grid lower-grid">
      <section className="panel"><PanelHeading eyebrow="预测校准" title="需要关注的商机" subtitle="不是催阶段，而是补齐关键事实" action="进入商机" onAction={() => onJump("opportunities")} /><div className="opportunity-mini-list">
        {opportunities.map((item, index) => <div className="opportunity-mini" key={item.name}><span className={`stage-dot s${index}`} /><div><strong>{item.customer}</strong><p>{item.name} · {item.evidence}</p></div><b>{item.amount}</b><span className="risk-pill">{item.risk}</span></div>)}
      </div></section>
      <section className="panel signal-panel"><PanelHeading eyebrow="限量提醒 · 1/5" title="产品机会判断" subtitle="只有达到事实门槛的方向才会出现" />
        <div className="signal-route"><span className="company-mark">知</span><div><strong>知行语言中心</strong><p>现有一体机 <b>→</b> ClassIn</p></div><span className="context-pill">情境事实</span></div>
        <blockquote>“新增教室需要支持异地老师联合授课，愿意评估组合方案。”</blockquote>
        <div className="signal-actions"><button>当前无需要</button><button>稍后评估</button><button className="solid" onClick={onCompose}>有场景，去确认</button></div>
      </section>
    </div>
  </div>;
}

function Metric({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  return <article className="metric-card"><div className={`metric-icon ${accent}`}><i /></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function PanelHeading({ eyebrow, title, subtitle, action, onAction }: { eyebrow?: string; title: string; subtitle: string; action?: string; onAction?: () => void }) {
  return <header className="panel-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h3>{title}</h3><p>{subtitle}</p></div>{action && <button onClick={onAction}>{action} →</button>}</header>;
}

function PriorityTask({ task, index, onFinish }: { task: typeof initialTasks[number]; index: number; onFinish: (id: number) => void }) {
  return <article className="priority-task"><span className={`task-order ${task.urgency}`}>{index}</span><div className="task-main"><div className="task-meta"><span>{task.time}</span><i /> <span>{task.source}</span></div><h4>{task.title}</h4><p><strong>{task.customer}</strong> · 要取得：{task.fact}</p><small>触发原因：{task.reason}</small></div><button className="task-action" onClick={() => onFinish(task.id)}>{task.action}</button></article>;
}

function TaskCenter({ tasks, tab, setTab, onFinish, onCompose }: { tasks: typeof initialTasks; tab: string; setTab: (v: string) => void; onFinish: (id: number) => void; onCompose: () => void }) {
  return <div className="page-content"><section className="page-intro"><div><span className="eyebrow">统一行动中心</span><h2>不是“做完待办”，而是取得下一项客户事实</h2><p>线索、客户、商机和活动任务在这里统一排序，同时保留它为什么出现。</p></div><button className="primary-button" onClick={onCompose}>＋ 记录处理结果</button></section>
    <section className="panel table-panel"><div className="filter-row"><div className="tabs">{["待我处理", "全部任务", "已完成"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div><div className="filter-actions"><button>今天到期⌄</button><button>全部来源⌄</button></div></div>
      <div className="task-table"><div className="task-table-head"><span>时效</span><span>任务与对象</span><span>需要取得的事实</span><span>为什么出现</span><span>负责人</span><span /></div>
      {tasks.length ? tasks.map((task) => <div className="task-table-row" key={task.id}><span className={`due ${task.urgency}`}>{task.time}</span><div><strong>{task.title}</strong><small>{task.customer} · {task.source}</small></div><span>{task.fact}</span><span>{task.reason}</span><span>{task.owner}</span><button onClick={() => onFinish(task.id)}>{task.action}</button></div>) : <div className="empty-state">这里暂时没有任务。完成结果会保留在客户时间线中。</div>}
      </div>
    </section>
  </div>;
}

function CustomerList({ onCompose }: { onCompose: () => void }) {
  return <div className="page-content"><section className="page-intro"><div><span className="eyebrow">统一客户主档</span><h2>先看客户正在发生什么，再看静态资料</h2><p>画像、联系人、产品、商机和下一动作使用同一组事实。</p></div><button className="primary-button" onClick={onCompose}>＋ 记录客户进展</button></section>
    <section className="metric-grid compact"><Metric label="我负责的客户" value="36" detail="本周新增 4 个" accent="indigo" /><Metric label="7天有新事实" value="21" detail="活跃客户占 58%" accent="green" /><Metric label="缺少下一动作" value="5" detail="建议今日补齐" accent="amber" /><Metric label="待判断产品机会" value="3" detail="今日限量投放 1 条" accent="blue" /></section>
    <section className="panel table-panel"><div className="filter-row"><div className="tabs"><button className="active">全部客户</button><button>本周活跃</button><button>需要关注</button></div><div className="filter-actions"><button>负责人：我⌄</button><button>客户类型⌄</button></div></div><div className="customer-table"><div className="customer-table-head"><span>客户</span><span>当前产品</span><span>下一动作</span><span>经营状态</span><span>负责人</span><span /></div>{customers.map((item) => <div className="customer-row" key={item.name}><div className="customer-name"><span>{item.name.slice(0, 1)}</span><div><strong>{item.name}</strong><small>{item.form} · {item.city}</small></div></div><span>{item.products}</span><span>{item.next}</span><span className={`status ${item.tone}`}>{item.health}</span><span>{item.owner}</span><button onClick={onCompose}>记录进展</button></div>)}</div></section>
  </div>;
}

function OpportunityList({ onCompose }: { onCompose: () => void }) {
  const [mode, setMode] = useState<OpportunityMode>("pipeline");
  const [cards, setCards] = useState(initialPipelineCards);
  const [customerKind, setCustomerKind] = useState<"全部" | CustomerKind>("全部");
  const [includePaused, setIncludePaused] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [lifecycleDraft, setLifecycleDraft] = useState<{ id: string; action: "pause" | "close"; reason: string; reviewDate: string } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<FunnelStage | null>(null);
  const [moveDraft, setMoveDraft] = useState<StageMoveDraft | null>(null);
  const [boardNotice, setBoardNotice] = useState<string | null>(null);

  const visibleCards = cards.filter((card) => (customerKind === "全部" || card.customerKind === customerKind) && (includePaused || card.lifecycle === "active"));
  const activeOpportunities = cards.filter((card) => card.kind === "opportunity" && card.lifecycle === "active");
  const pausedCount = cards.filter((card) => card.lifecycle === "paused").length;
  const moveSource = moveDraft ? cards.find((card) => card.id === moveDraft.id) : undefined;

  function formatLaneAmount(items: PipelineCard[]) {
    const amount = items.reduce((sum, item) => sum + Number((item.amount || "0").replace(/[^0-9]/g, "")), 0);
    return amount ? `¥${new Intl.NumberFormat("zh-CN").format(amount)}` : "不计预测";
  }

  function reactivate(cardId: string) {
    setCards((items) => items.map((item) => item.id === cardId ? { ...item, lifecycle: "active", stageAge: "刚刚重新激活", pauseReason: undefined, reviewDate: undefined, nextTask: item.nextTask || "确认重新启动后的下一动作", due: "今天" } : item));
    setMenuId(null);
  }

  function submitLifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lifecycleDraft) return;
    setCards((items) => items.map((item) => item.id === lifecycleDraft.id ? {
      ...item,
      lifecycle: lifecycleDraft.action === "pause" ? "paused" : "closed",
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
    setBoardNotice(null);
    setMoveDraft({
      id: card.id,
      targetStage,
      opportunityName: card.kind === "lead" ? `${card.customer} · ${card.product}商机` : card.title,
      contactName: "",
      evidence: "",
      nextTask: card.nextTask,
    });
  }

  function submitStageMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!moveDraft) return;
    const source = cards.find((item) => item.id === moveDraft.id);
    if (!source) return;
    const converted = source.kind === "lead";
    setCards((items) => items.map((item) => item.id === moveDraft.id ? {
      ...item,
      kind: "opportunity",
      stage: moveDraft.targetStage,
      title: moveDraft.opportunityName,
      contact: converted ? moveDraft.contactName : item.contact,
      evidence: moveDraft.evidence,
      nextTask: moveDraft.nextTask,
      due: "今天",
      stageAge: converted ? "刚刚由潜客转化" : "刚刚完成阶段校准",
      taskSource: converted ? "潜客转化" : "阶段拖拽确认",
    } : item));
    const targetLabel = funnelStages.find((stage) => stage.id === moveDraft.targetStage)?.label;
    setBoardNotice(converted ? `已把“${source.customer}”转为客户并创建商机，进入“${targetLabel}”阶段。` : `已将“${source.title}”移动到“${targetLabel}”，并记录阶段依据与下一任务。`);
    setMoveDraft(null);
  }

  return <div className="page-content opportunity-page">
    <section className="page-intro opportunity-intro"><div><span className="eyebrow">客户经营全景</span><h2>从潜客到成交，用同一张事实看板推进</h2><p>页面连续展示潜客和商机；后台仍保留线索、客户与商机的数据边界。</p></div><button className="primary-button" onClick={onCompose}>＋ 记录一次客户进展</button></section>

    <section className="opportunity-command panel">
      <div className="opportunity-modes" aria-label="商机工作方式">
        <button className={mode === "pipeline" ? "active" : ""} onClick={() => setMode("pipeline")}><span>▦</span> 全景阶段看板</button>
        <button className={mode === "forecast" ? "active" : ""} onClick={() => setMode("forecast")}><span>◫</span> 业绩与预测</button>
        <button className={mode === "lifecycle" ? "active" : ""} onClick={() => setMode("lifecycle")}><span>◌</span> 生命周期治理</button>
      </div>
      <div className="opportunity-facts"><span><b>{cards.filter((card) => card.kind === "lead" && card.lifecycle === "active").length}</b> 个开放潜客</span><i /><span><b>{activeOpportunities.length}</b> 个开放商机</span><i /><span><b>{pausedCount}</b> 个暂停培育</span></div>
    </section>

    {mode === "pipeline" && <>
      <section className="pipeline-summary">
        <article><span>售前客户池</span><strong>{cards.filter((card) => card.lifecycle === "active").length}</strong><small>潜客与开放商机合并查看</small></article>
        <article><span>本周阶段推进</span><strong>6</strong><small>其中 2 个由拜访事实触发</small></article>
        <article><span>缺少下一任务</span><strong className="warning-text">1</strong><small>商务推进阶段需今天处置</small></article>
        <article><span>关键活动覆盖</span><strong>71%</strong><small>演示、沙龙与客户拜访</small></article>
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
                {stageCards.map((card) => <article draggable={card.lifecycle === "active"} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", card.id); setDraggingId(card.id); setBoardNotice(null); }} onDragEnd={() => { setDraggingId(null); setDropStage(null); }} className={`${card.lifecycle === "paused" ? "pipeline-card is-paused" : "pipeline-card"}${draggingId === card.id ? " is-dragging" : ""}`} key={card.id}>
                  <div className="card-topline"><span className="drag-handle" title="拖拽改变阶段" aria-hidden="true">⠿</span><span className={card.kind === "lead" ? "object-pill lead" : "object-pill"}>{card.kind === "lead" ? "潜客" : card.customerKind}</span>{card.lifecycle === "paused" && <span className="paused-pill">暂停培育</span>}<div className="card-menu-wrap"><button className="more-button" aria-label={`管理${card.title}生命周期`} onClick={() => setMenuId(menuId === card.id ? null : card.id)}>•••</button>{menuId === card.id && <div className="card-menu">{card.lifecycle === "paused" ? <button onClick={() => reactivate(card.id)}>重新激活并生成任务</button> : <button onClick={() => setLifecycleDraft({ id: card.id, action: "pause", reason: "客户时间窗口未确定", reviewDate: "2026-08-24" })}>暂停并设置复评日期</button>}<button className="danger" onClick={() => setLifecycleDraft({ id: card.id, action: "close", reason: "客户明确暂不推进", reviewDate: "" })}>关闭并保留原因</button></div>}</div></div>
                  <h3>{card.title}</h3><p className="card-customer">{card.customer}{card.contact ? ` · ${card.contact}` : ""} · {card.owner}</p><span className="product-pill">{card.product}</span>
                  <blockquote>{card.evidence}</blockquote>
                  <div className="card-stage-meta"><span>{card.stageAge}</span>{card.amount && <strong>{card.amount}</strong>}</div>
                  {card.lifecycle === "paused" && <div className="pause-reason"><span>{card.pauseReason}</span><b>{card.reviewDate} 复评</b></div>}
                  <div className="card-task"><span>下一任务 · {card.due}</span><strong>{card.nextTask}</strong><small>{card.taskSource}</small></div>
                  {card.lifecycle === "active" && <label className="stage-move-control"><span>移动阶段</span><select aria-label={`移动${card.title}到其他阶段`} value="" onChange={(event) => { if (event.target.value) requestStageMove(card.id, event.target.value as FunnelStage); }}><option value="">选择阶段…</option>{funnelStages.filter((item) => item.id !== "lead" && item.id !== card.stage).map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>}
                  <button className="card-action" onClick={onCompose}>{card.kind === "lead" ? "记录处理" : "记录跟进"}<span>→</span></button>
                </article>)}
                {!stageCards.length && <div className="lane-empty">当前筛选下没有客户</div>}
              </div>
            </section>;
          })}
        </div>
      </section>
      <p className="prototype-note"><strong>当前为可交互原型：</strong>阶段和生命周期操作已可演示，但保存仍是前端状态；接入企培 MCP 后才会写回销售易并形成审计记录。</p>
    </>}

    {mode === "forecast" && <>
      <section className="forecast-strip"><div><span>未来30天目标</span><strong>¥300,000</strong></div><i /><div><span>保底预测</span><strong>¥198,000</strong><small>66% 覆盖</small></div><div><span>最佳情况</span><strong>¥366,000</strong><small>122% 覆盖</small></div><div className="forecast-gap"><span>目标差额</span><strong>¥102,000</strong><small>优先补验证结论</small></div></section>
      <section className="forecast-explanation"><strong>预测只读取开放商机</strong><span>潜客、暂停客户和没有事实依据的金额不进入预测；阶段看板负责经营过程，预测页负责业绩判断。</span></section>
      <section className="panel table-panel"><div className="filter-row"><div className="tabs"><button className="active">未来30天</button><button>本季度</button></div><div className="filter-actions"><button>负责人：全部⌄</button><button>机构与个体⌄</button></div></div><div className="opp-table"><div className="opp-table-head"><span>商机</span><span>事实阶段</span><span>客观证据</span><span>金额</span><span>下一动作</span><span>风险</span><span /></div>{opportunities.map((item) => <div className="opp-row" key={item.name}><div><strong>{item.name}</strong><small>{item.customer}</small></div><span className="stage-pill">{item.stage}</span><span>{item.evidence}</span><strong>{item.amount}</strong><span>{item.next}</span><span className="risk-pill">{item.risk}</span><button onClick={onCompose}>校准</button></div>)}</div></section>
    </>}

    {mode === "lifecycle" && <>
      <section className="lifecycle-overview">
        <article className="panel"><span className="eyebrow">开放池容量</span><h3>只保留值得继续投入的客户</h3><p>开放 {cards.filter((card) => card.lifecycle === "active").length} / 建议上限 12；达到上限前先处置无任务、超时和长期无反馈对象。</p><div className="capacity-meter"><i style={{ width: `${cards.filter((card) => card.lifecycle === "active").length / 12 * 100}%` }} /></div></article>
        <article className="panel"><span className="eyebrow">商机准入门槛</span><h3>潜客进入“兴趣”前必须具备</h3><div className="admission-list"><span>1. 客户主体与联系人明确</span><span>2. 产品或采购场景明确</span><span>3. 客户表达真实意愿</span><span>4. 已有负责人和下一任务</span></div></article>
      </section>
      <section className="panel lifecycle-panel"><div className="lifecycle-heading"><div><span className="eyebrow">建议规则 · 待业务共同校准</span><h3>阶段时钟和处置队列</h3><p>超时不自动判输，但必须继续、暂停或关闭，避免商机池长期失真。</p></div><div className="stage-clocks"><span><b>兴趣</b>14天</span><span><b>体验</b>7天</span><span><b>验证</b>21天</span><span><b>商务</b>30天</span></div></div>
        <div className="lifecycle-table"><div className="lifecycle-table-head"><span>健康度</span><span>客户与对象</span><span>当前阶段</span><span>最近事实</span><span>下一任务/复评</span><span>处置</span></div>{cards.filter((card) => card.kind === "opportunity" && card.lifecycle !== "closed").map((card) => <div className="lifecycle-row" key={card.id}><span className={card.lifecycle === "paused" ? "health-badge paused" : card.nextTask === "补充下一任务" ? "health-badge risk" : "health-badge healthy"}>{card.lifecycle === "paused" ? "暂停培育" : card.nextTask === "补充下一任务" ? "需处置" : "健康推进"}</span><div><strong>{card.customer}</strong><small>{card.title} · {card.amount}</small></div><span>{funnelStages.find((stage) => stage.id === card.stage)?.label}<small>{card.stageAge}</small></span><p>{card.evidence}</p><div><strong>{card.nextTask}</strong><small>{card.lifecycle === "paused" ? card.reviewDate : card.due}</small></div><div className="row-actions">{card.lifecycle === "paused" ? <><button onClick={() => reactivate(card.id)}>激活</button><button onClick={() => setLifecycleDraft({ id: card.id, action: "close", reason: "客户明确暂不推进", reviewDate: "" })}>关闭</button></> : <><button onClick={onCompose}>跟进</button><button onClick={() => setLifecycleDraft({ id: card.id, action: "pause", reason: "客户时间窗口未确定", reviewDate: "2026-08-24" })}>暂停</button><button onClick={() => setLifecycleDraft({ id: card.id, action: "close", reason: "客户明确暂不推进", reviewDate: "" })}>关闭</button></>}</div></div>)}</div>
      </section>
    </>}

    {lifecycleDraft && <div className="modal-backdrop" role="presentation"><form className="lifecycle-dialog" role="dialog" aria-modal="true" aria-label={lifecycleDraft.action === "pause" ? "暂停客户推进" : "关闭客户推进"} onSubmit={submitLifecycle}><header><div><span className="eyebrow">生命周期处置</span><h3>{lifecycleDraft.action === "pause" ? "暂停，但不要丢失客户" : "关闭并保留历史原因"}</h3><p>{lifecycleDraft.action === "pause" ? "对象移出开放池，同时保留当前事实阶段和重新评估时间。" : "对象不再出现在开放看板中，历史活动和阶段变化继续保留。"}</p></div><button type="button" onClick={() => setLifecycleDraft(null)}>×</button></header><label>处置原因<select value={lifecycleDraft.reason} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, reason: event.target.value })}><option>客户时间窗口未确定</option><option>预算尚未落实</option><option>已有其他方案</option><option>客户明确暂不推进</option><option>重复或无效对象</option></select></label>{lifecycleDraft.action === "pause" && <label>重新评估日期<input type="date" required value={lifecycleDraft.reviewDate} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, reviewDate: event.target.value })} /></label>}<footer><button type="button" className="secondary-button" onClick={() => setLifecycleDraft(null)}>取消</button><button className="primary-button" type="submit">确认处置</button></footer></form></div>}
    {moveDraft && moveSource && <div className="modal-backdrop" role="presentation"><form className="stage-move-dialog" role="dialog" aria-modal="true" aria-label={moveSource.kind === "lead" ? "潜客转客户并创建商机" : "确认商机阶段变化"} onSubmit={submitStageMove}>
      <header><div><span className="eyebrow">{moveSource.kind === "lead" ? "潜客转化确认" : "事实阶段校准"}</span><h3>{moveSource.kind === "lead" ? "转客户，并生成一条正式商机" : `移动到“${funnelStages.find((stage) => stage.id === moveDraft.targetStage)?.label}”阶段`}</h3><p>{moveSource.kind === "lead" ? "拖拽只发起转化；确认客户、联系人、事实和下一任务后才真正创建。" : "拖拽不能替代客户事实，请确认本次阶段变化的依据和下一任务。"}</p></div><button type="button" onClick={() => setMoveDraft(null)}>×</button></header>
      <div className="stage-route"><span>{moveSource.kind === "lead" ? "潜客" : funnelStages.find((stage) => stage.id === moveSource.stage)?.label}</span><b>→</b><strong>{funnelStages.find((stage) => stage.id === moveDraft.targetStage)?.label}</strong></div>
      <div className="target-stage-criteria"><span>目标阶段准入事实</span><strong>{stageMoveCriteria[moveDraft.targetStage]}</strong></div>
      {moveSource.kind === "lead" && <div className="conversion-summary"><div><span>将建立客户</span><strong>{moveSource.customer}</strong><small>{moveSource.customerKind} · 负责人 {moveSource.owner}</small></div><div><span>来源事实保留</span><strong>{moveSource.taskSource}</strong><small>原始产品方向：{moveSource.product}</small></div></div>}
      <div className="stage-move-fields">
        {moveSource.kind === "lead" && <><label>确认后的联系人<input required value={moveDraft.contactName} onChange={(event) => setMoveDraft({ ...moveDraft, contactName: event.target.value })} placeholder="姓名或明确称呼" /></label><label>商机名称<input required value={moveDraft.opportunityName} onChange={(event) => setMoveDraft({ ...moveDraft, opportunityName: event.target.value })} /></label></>}
        <label className="wide">本次阶段变化依据<textarea required value={moveDraft.evidence} onChange={(event) => setMoveDraft({ ...moveDraft, evidence: event.target.value })} placeholder="填写能够满足上方准入条件的客户事实" /></label>
        <label className="wide">下一任务<input required value={moveDraft.nextTask} onChange={(event) => setMoveDraft({ ...moveDraft, nextTask: event.target.value })} placeholder="下一步要取得什么客户事实" /></label>
      </div>
      {moveSource.kind === "lead" && <div className="conversion-effects"><strong>确认后一次完成</strong><span>✓ 建立或关联客户主档</span><span>✓ 保留潜客来源与跟进历史</span><span>✓ 创建商机并进入目标阶段</span><span>✓ 创建一条开放的下一任务</span></div>}
      <div className="move-guardrail">不会根据拖拽自动补造联系人、预算、客户承诺或成交概率。</div>
      <footer><button type="button" className="secondary-button" onClick={() => setMoveDraft(null)}>取消</button><button className="primary-button" type="submit">{moveSource.kind === "lead" ? "确认转客户并创建商机" : "确认阶段变化"}</button></footer>
    </form></div>}
  </div>;
}

function ActivityView() {
  return <div className="page-content"><section className="page-intro"><div><span className="eyebrow">客户经营活动</span><h2>活动结束不是终点，客户事实才是结果</h2><p>从邀约、报名、到场到24小时跟进，每一步都能找到负责人和客户结果。</p></div><button className="primary-button">＋ 创建沙龙活动</button></section><section className="activity-grid"><article className="panel event-card"><span className="eyebrow">筹备中 · 8月8日</span><h3>教育数字化课堂体验沙龙</h3><p>一体机课堂体验与 ClassIn 融合方案</p><div className="event-progress"><span style={{width:"63%"}} /></div><div className="event-stats"><div><strong>19</strong><span>已报名</span></div><div><strong>30</strong><span>目标人数</span></div><div><strong>4</strong><span>开放任务</span></div></div><button>管理参会客户 →</button></article><article className="panel activity-advice"><span className="ai-orb">✦</span><h3>活动运营建议</h3><p>距离活动还有 5 天，报名容量缺口 11 人。建议优先邀请已使用 ClassIn、近期出现教室升级事实的客户。</p><div className="guide-block"><span>成功口径</span><strong>实际到场 + 24小时内取得体验反馈</strong></div><button>生成邀约任务包</button></article></section></div>;
}

function InsightView() {
  return <div className="page-content"><section className="page-intro"><div><span className="eyebrow">经营洞察</span><h2>看结果，也看结果背后的事实质量</h2><p>不把提醒数量和活动数量当作业绩，关注有效发现与真实推进。</p></div><button className="primary-button">导出本月复盘</button></section><section className="metric-grid"><Metric label="预测命中率" value="82%" detail="较上月 +6%" accent="green" /><Metric label="任务按时完成" value="74%" detail="首响任务 91%" accent="blue" /><Metric label="机会有效发现率" value="31%" detail="3 条进入事实探索" accent="violet" /><Metric label="活动后有效跟进" value="68%" detail="仍有 5 位待处理" accent="amber" /></section><section className="insight-grid"><article className="panel chart-card"><PanelHeading eyebrow="过去6周" title="预测质量趋势" subtitle="承诺预测与实际首款的差距持续缩小" /><div className="fake-chart"><div className="chart-axis"><span>100%</span><span>75%</span><span>50%</span><span>25%</span></div><div className="chart-bars">{[48,58,55,70,76,82].map((v,i)=><div key={i}><i style={{height:`${v}%`}} /><span>W{i+1}</span></div>)}</div></div></article><article className="panel"><PanelHeading eyebrow="本月主要缺口" title="管理动作建议" subtitle="从事实缺口反推团队辅导" /><div className="recommend-list"><div><b>01</b><p><strong>体验完成后反馈不及时</strong><span>平均等待 2.4 天 · 建议设定 24 小时跟进规则</span></p></div><div><b>02</b><p><strong>商务推进缺少付款日期</strong><span>影响 ¥10.2 万预测可信度</span></p></div><div><b>03</b><p><strong>活动邀约客户匹配度偏低</strong><span>本月到场率 63% · 需要优化目标客群</span></p></div></div></article></section></div>;
}

function Composer({ step, note, setNote, onClose, onAnalyze, onBack, onConfirm }: { step: "write" | "review" | "done"; note: string; setNote: (v: string) => void; onClose: () => void; onAnalyze: () => void; onBack: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop" role="presentation"><section className="composer" role="dialog" aria-modal="true" aria-label="记录客户进展">
    <header><div><span className="eyebrow">一次记录 · 联动更新</span><h2>{step === "write" ? "刚刚和客户发生了什么？" : step === "review" ? "请确认系统理解是否正确" : "客户进展已同步"}</h2><p>{step === "write" ? "像给同事发消息一样描述即可，系统会先整理、再由你确认。" : step === "review" ? "AI 只整理可见事实，不会替客户作出承诺。" : "客户、商机和下一任务已经形成闭环。"}</p></div><button className="modal-close" onClick={onClose}>×</button></header>
    {step === "write" && <div className="compose-body"><div className="context-select"><span>关联对象</span><button><i className="company-mark">启</i><strong>启航教育集团</strong><small> · 6间教室升级</small><b>⌄</b></button></div><div className="note-box"><textarea value={note} onChange={(e) => setNote(e.target.value)} aria-label="客户进展内容" placeholder="例如：王校长确认演示效果，准备先采购6台，希望下周收到报价……" /><div><button className="voice-button">◉ 按住说话</button><span>{note.length} 字</span></div></div><div className="quick-prompts"><span>也可以快速补充：</span><button onClick={() => setNote(note + " 客户已确认使用场景。")}>客户承诺</button><button onClick={() => setNote(note + " 体验结果已确认。")}>体验结果</button><button onClick={() => setNote(note + " 下一步需要提交报价。")}>下一步</button></div><div className="compose-tip"><span>✦</span><p><strong>系统会尝试整理</strong>客户画像、联系人、产品与数量、商机阶段、风险以及下一任务。</p></div></div>}
    {step === "review" && <div className="review-body"><div className="source-note"><span>客户原始记录</span><p>{note}</p></div><div className="change-section"><header><h3>将写入客户事实</h3><span>3 项</span></header><div className="change-row"><i className="change-mark green">✓</i><div><span>客户反馈</span><strong>认可一体机演示效果</strong><small>来源：本次客户沟通</small></div></div><div className="change-row"><i className="change-mark blue">6</i><div><span>产品计划</span><strong>教学一体机 · 6 台</strong><small>明确数量，不推测预算</small></div></div><div className="change-row"><i className="change-mark violet">承</i><div><span>客户意愿</span><strong>准备采购，希望下周收到正式报价</strong><small>判定为明确承诺</small></div></div></div><div className="change-section"><header><h3>将联动更新</h3><span>2 项</span></header><div className="change-row"><i className="change-mark amber">机</i><div><span>商机变化</span><strong>体验验证 → 商务推进</strong><small>依据：适配认可 + 明确采购计划</small></div><button>修改</button></div><div className="change-row"><i className="change-mark indigo">任</i><div><span>下一任务 · 周五 10:00</span><strong>提交 6 台一体机正式报价</strong><small>目标事实：客户确认报价与付款安排</small></div><button>修改</button></div></div><div className="guardrail">不会自动创建新商机，也不会修改客户未明确表达的预算和付款日期。</div></div>}
    {step === "done" && <div className="done-state"><span>✓</span><h3>更新完成</h3><p>已保存 3 项客户事实，推进 1 个商机，并创建 1 项下一任务。</p></div>}
    {step !== "done" && <footer>{step === "review" ? <button className="secondary-button" onClick={onBack}>返回修改</button> : <button className="secondary-button" onClick={onClose}>取消</button>}<button className="primary-button" onClick={step === "write" ? onAnalyze : onConfirm} disabled={!note.trim()}>{step === "write" ? "✦ 智能整理本次进展" : "确认并同步更新"}</button></footer>}
  </section></div>;
}
