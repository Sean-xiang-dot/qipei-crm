# 企培 CRM

以可追溯客户事实驱动任务、商机和预测的企业培训销售经营平台。

## 鉴权

系统不使用 ChatGPT 身份作为业务身份。浏览器通过本站同源接口启动企培 CRM MCP 的销售易 OAuth：

1. `POST /api/crm-auth/start` 向企培 MCP 创建登录请求；
2. 用户在销售易页面完成授权；
3. `GET /api/crm-auth/poll` 取得短期 CRM session，并写入本站 HttpOnly Cookie；
4. 后续服务端请求使用 `X-Enterprise-Training-Session-Token` 调用 MCP REST 接口；
5. 客户、商机和写回权限继续由企培 MCP 在服务端校验。

运行时配置见 `.env.example`。

## 本地命令

```bash
npm install
npm run build
npm run lint
```
