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
4. **设置密钥** (可选)：`npx wrangler secret put TG_BOT_TOKEN`。
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

### ⚠️ 重要运行提示

- **浏览器必须开启**：由于 RSSFlow 是以浏览器扩展形式运行的，**安装了该扩展的浏览器必须处于开启状态**（不需要一直打开 RSSFlow 页面，但浏览器进程不能关闭）。
- **宿主环境**：浏览器是 MCP 服务的“宿主”。如果关闭浏览器，远程网关将无法联系到您的本地数据，导致 MCP 客户端连接超时。

---

### 🛠 内置工具参考
- `rssflow_list_actions`：列出可用指令图谱与标签。
- `rssflow_query_summaries`：获取资讯原始数据与 AI 摘要。
- `rssflow_execute_command`：执行特定的预设分析任务。

---

## License
MIT
