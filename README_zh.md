# RSSFlow MCP Bridge (中文版)

[English Version](./README.md)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Pizone-ai/rssflow-mcp-bridge)

---

RSSFlow MCP Bridge 是一个基于 Cloudflare Workers 构建的高性能网关。它作为远程 MCP（模型上下文协议）客户端与 RSSFlow 本地系统之间的安全桥梁，让 AI 模型能够跨地域与您的 RSS 数据进行交互。

### 🌟 功能特性
- **MCP v4.0 协议支持**：完整实现工具发现与执行流程。
- **发现优先架构**：自动映射系统能力、内置 AI 指令及可用标签。
- **Telegram 集成**：内置 Webhook 支持，可将 Telegram 会话绑定至 RSSFlow Key。
- **基于 KV 的消息队列**：利用 Cloudflare KV 实现可靠的消息分发与结果回传。
- **边缘性能优化**：由 Hono 驱动，在 Cloudflare 边缘节点极速响应。

---

### 🚀 部署指南

您可以选择使用 AI 辅助部署（极速）或手动部署（专业控制）。

#### ⏱️ A. 5 分钟极速上手 (AI 辅助模式)

如果你希望通过 AI 助手快速完成部署，请在编辑器中打开本项目文件夹，并向 AI（如 Antigravity, Cursor 或 Windsurf）发送以下指令：

> **"帮我部署这个 RSSFlow Bridge。你需要帮我检查本地环境，创建一个名为 `RSSFLOW_BRIDGE_KV` 的 KV 空间，将生成的 ID 填入 `wrangler.toml`，并最后执行发布命令。"**

#### 🛠️ B. 专业部署指南 (手动模式)

1. **环境准备**：确保已安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) 并通过 `npx wrangler login` 登录。
2. **创建 KV**：运行 `npx wrangler kv:namespace create RSSFLOW_BRIDGE_KV` 并记录生成的 `id`。
3. **配置文件**：将 `wrangler.toml.example` 重命名为 `wrangler.toml`，并将 KV `id` 填入对应字段。
4. **设置密钥** (可选)：Telegram 聊天使用 `npx wrangler secret put TG_BOT_TOKEN`；飞书聊天请参考下方飞书配置章节设置 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_VERIFICATION_TOKEN` 与 `FEISHU_ENCRYPT_KEY`。
5. **编译发布**：执行 `npm install && npm run deploy`。

---

### 🔗 RSSFlow 客户端集成指南

部署成功后，你需要将网关网址与您的 RSSFlow 客户端关联：

1. **获取 URL**：部署完成后，Cloudflare 会输出一个以 `.workers.dev` 结尾的网址（例如 `https://rssflow-bridge.yourname.workers.dev`）。
2. **在 RSSFlow 中配置**：
   - 打开 RSSFlow 客户端。
   - 进入 **设置 (Settings)** -> **MCP 设置 (MCP Settings)**。
   - **生成身份密钥 (Identity Key)**：点击“生成新密钥”按钮，获取一串以 `rf_v1_` 开头的密钥。
   - **保存配置**：在 **Worker 网址 (Worker URL)** 中粘贴部署好的网址，并确保下方身份密钥已填好，最后保存。

3.  **密钥的使用场景 (重要！)**：
    - **外部 MCP 客户端 (如 Cursor/Claude Desktop)**：
      - **类型选择**：可流式传输的 HTTP (`streamableHttp`)。
      - **URL 格式**：必须带上密钥参数。
        - 示例：`https://your-worker.dev/mcp?key=你的身份密钥`
    - **Telegram 绑定**：向 Bot 发送 `/bind 你的身份密钥`，即可将该 Telegram 会话与您的 RSSFlow 关联。

4. **验证连接**：保存后，客户端会自动尝试通过网关与您的本地环境建立通信链路。

---

### 🧰 MCP 标准模式与内置工具

标准 MCP 模式用于 Cursor、Claude Desktop 等支持 MCP 的 AI 客户端。客户端通过 `streamableHttp` 连接 `https://<你的域名>.workers.dev/mcp?key=你的身份密钥` 后，会先执行工具发现，再按需调用 RSSFlow 暴露的内置工具。

#### 1. 接入方式

- **协议类型**：`streamableHttp`
- **连接地址**：`https://<你的域名>.workers.dev/mcp?key=你的身份密钥`
- **身份密钥**：来自 RSSFlow 客户端 **MCP 设置** 中生成的 `rf_v1_` 开头密钥。
- **运行依赖**：RSSFlow 浏览器扩展所在浏览器必须保持开启，否则远程 MCP 请求无法被本地客户端轮询处理。

#### 2. 工具发现与调用流程

1. MCP 客户端连接 Worker 的 `/mcp` 端点。
2. Worker 响应 `initialize`、`tools/list` 等 MCP 标准请求，并返回可用工具列表。
3. 客户端调用具体工具时，Worker 会把请求写入 Cloudflare KV 队列。
4. RSSFlow 本地客户端轮询队列、执行任务，并将结果回传给 Worker。
5. Worker 将执行结果返回给 MCP 客户端。

#### 3. 内置工具参考

- `rssflow_list_actions`：能力地图工具，用于列出 RSSFlow 当前可用的系统说明、内置 AI 快捷指令以及标签列表。建议在不确定可用标签或命令时优先调用。
- `rssflow_query_summaries`：资讯数据查询工具，用于获取指定标签或时间范围内的资讯原始数据与 AI 摘要。适合做阅读、分析、总结、问答前的数据获取。
- `rssflow_execute_command`：预设任务执行工具，用于调用 RSSFlow 内置分析任务或报告生成逻辑。适合在用户明确要求生成报告、播客脚本、推文、深度研报等固定格式输出时使用。

#### 4. 使用建议

- 先用 `rssflow_list_actions` 获取可用标签与指令，再调用 `rssflow_query_summaries` 或 `rssflow_execute_command`，可以减少标签不存在或命令不匹配的问题。
- `rssflow_query_summaries` 更适合获取素材后由 AI 自行分析；`rssflow_execute_command` 更适合执行 RSSFlow 已内置的固定分析流程。
- 当前工具调用依赖本地 RSSFlow 客户端处理队列，因此浏览器关闭或网络不可达时，MCP 请求可能超时。

---

### 🤖 Telegram 聊天场景配置指引

此 Worker 支持两种接入模式，请勿混淆：
1. **标准 MCP 模式**：用于 Cursor、Claude Desktop 等 AI 编辑器，通过 `streamableHttp` 协议调用工具。
2. **Telegram 聊天模式**：用于通过 Telegram Bot 与 AI 直接对话、接收推送及下达指令。

#### 1. 配置 Bot 令牌 (TG_BOT_TOKEN)
您可以通过以下任一方式设置您的机器人密钥：

- **方法 A (命令行 - 推荐)**：执行 `npx wrangler secret put TG_BOT_TOKEN` 并在提示时输入 Token。
- **方法 B (Cloudflare 后台)**：进入 Cloudflare Worker 详情页 -> **Settings** -> **Variables**，在 **Environment Variables** 中点击 "Add variable"，名称填 `TG_BOT_TOKEN`，值填您的 Token，点击 **Save and deploy**。

#### 2. 多 Bot 支持 (进阶)
如果您有多个 Bot 需要同时接入：
- **第一个 (默认) Bot**：环境变量名设为 `TG_BOT_TOKEN`。
- **后续 Bot**：环境变量名设为 `TG_BOT_TOKEN_你的ID`（例如 `TG_BOT_TOKEN_MYBOT`）。
- **Webhook 激活链接**：
  - 默认：`https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<你的域名>.workers.dev/webhook/telegram/`
  - 带 ID 的 Bot：`https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<你的域名>.workers.dev/webhook/telegram/你的ID`

---

### 🪽 飞书聊天场景配置指引

飞书聊天模式用于通过飞书机器人与 RSSFlow AI 直接对话、接收推送及下达指令。它与标准 MCP 模式独立配置：MCP 客户端仍使用 `/mcp?key=你的身份密钥`，飞书事件回调统一使用 `/webhook/feishu`。

#### 1. 创建飞书应用并开启机器人能力

1. 进入 [飞书开放平台](https://open.feishu.cn/) 创建企业自建应用。
2. 在应用的 **凭证与基础信息** 中记录 `App ID` 与 `App Secret`。
3. 在 **应用能力** 中启用 **机器人**，并将应用发布或安装到目标企业/群聊中。

#### 2. 配置 Worker 环境变量

建议将敏感信息作为 Cloudflare Worker Secret 保存。其中 `FEISHU_APP_ID` 与 `FEISHU_APP_SECRET` 为飞书回信和主动推送所需；`FEISHU_VERIFICATION_TOKEN` 与 `FEISHU_ENCRYPT_KEY` 为非必填项，仅在您希望启用飞书 Token 校验或事件加密/签名校验时配置。

```bash
npx wrangler secret put FEISHU_APP_ID
npx wrangler secret put FEISHU_APP_SECRET
```

可选安全配置：

```bash
npx wrangler secret put FEISHU_VERIFICATION_TOKEN
npx wrangler secret put FEISHU_ENCRYPT_KEY
```

- `FEISHU_APP_ID`：飞书应用的 App ID，用于获取 `tenant_access_token` 并发送消息。
- `FEISHU_APP_SECRET`：飞书应用的 App Secret，用于获取 `tenant_access_token` 并发送消息。
- `FEISHU_VERIFICATION_TOKEN`（可选）：飞书事件订阅中的 Verification Token；如果 Worker 未配置该变量，则不会校验 token。
- `FEISHU_ENCRYPT_KEY`（可选）：飞书事件订阅中的 Encrypt Key；配置后 Worker 会校验飞书签名并解密加密事件。仅当飞书后台开启事件加密或您需要签名校验时配置。

也可以在 Cloudflare 后台进入 Worker -> **Settings** -> **Variables**，将上述变量添加到 **Environment Variables / Secrets** 后点击 **Save and deploy**。

#### 3. 配置飞书事件订阅

1. 在飞书开放平台进入应用的 **事件与回调**。
2. 将 **请求网址** 设置为：`https://<你的域名>.workers.dev/webhook/feishu`。
3. 如需启用额外安全校验，可将飞书后台显示的 Verification Token 和 Encrypt Key 分别填入 Worker 的 `FEISHU_VERIFICATION_TOKEN` 与 `FEISHU_ENCRYPT_KEY`；不配置时也可以完成基础消息接收。
4. 添加事件：`接收消息 v2.0`（事件类型 `im.message.receive_v1`）。
5. 保存配置，确保 URL 验证通过。

#### 4. 授权权限并绑定 RSSFlow

1. 在飞书应用权限中开通消息相关权限，例如读取用户发送给机器人的消息、向会话发送消息等，并按飞书要求重新发布/安装应用。
2. 在 RSSFlow 客户端的 **MCP 设置** 中生成身份密钥，格式通常以 `rf_v1_` 开头。
3. 在飞书与机器人对话或已安装机器人的群聊中发送：`/bind 你的身份密钥`。
4. 绑定成功后，继续向机器人发送文本消息即可进入 RSSFlow 聊天流程；非文本消息会被忽略。

#### 5. 推送与回复说明

- 飞书回信与主动推送依赖 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`。缺少这两个变量时，Worker 可以接收并绑定事件，但无法向飞书发送回复。
- 绑定后，Worker 会记录飞书 `chat_id` 与 RSSFlow 身份密钥的对应关系；后续 `/push` 如未显式传入 `platform` 与 `chatId`，会优先使用该绑定目标。

---

### ⚠️ 重要运行提示

- **浏览器必须开启**：由于 RSSFlow 是以浏览器扩展形式运行的，**安装了该扩展的浏览器必须处于开启状态**（不需要一直打开 RSSFlow 页面，但浏览器进程不能关闭）。
- **宿主环境**：浏览器是 MCP 服务的“宿主”。如果关闭浏览器，远程网关将无法联系到您的本地数据，导致 MCP 客户端连接超时。

## License
MIT
