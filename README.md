# RSSFlow MCP Bridge

[中文版](./README_zh.md)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Pizone-ai/rssflow-mcp-bridge)

---

RSSFlow MCP Bridge is a high-performance gateway built on Cloudflare Workers. It acts as a secure link between remote MCP (Model Context Protocol) clients and the RSSFlow local system, enabling AI models to interact with your RSS data from anywhere.

### 🌟 Features
- **MCP v4.0 Protocol Support**: Full implementation of Tool discovery and execution.
- **Discovery-First Architecture**: Automatically maps system capabilities, built-in AI commands, and available tags.
- **Telegram Integration**: Built-in webhook support for binding Telegram chats to RSSFlow keys.
- **KV-Based Queuing**: Robust message and result handling using Cloudflare KV.
- **Edge Performance**: Powered by Hono and optimized for Cloudflare edge execution.

---

### 🚀 Deployment Guide

Choose between AI-assisted deployment (Quick) or manual deployment (Professional).

#### ⏱️ A. Quick Start (AI-Assisted)

If you prefer using an AI assistant to handle the setup, open this folder in your AI-powered editor (like Antigravity, Cursor, or Windsurf) and send this prompt:

> **"Help me deploy this RSSFlow Bridge. You need to check my environment, create a KV namespace named `RSSFLOW_BRIDGE_KV`, fill the generated ID into `wrangler.toml`, and finally run the deployment command."**

#### 🛠️ B. Professional Deployment (Manual)

1. **Prerequisites**: Ensure [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) is installed and logged in via `npx wrangler login`.
2. **Setup KV**: Run `npx wrangler kv:namespace create RSSFLOW_BRIDGE_KV` and copy the generated `id`.
3. **Configure**: Rename `wrangler.toml.example` to `wrangler.toml` and paste the KV `id` into the configuration.
4. **Secrets** (Optional): For Telegram chat, run `npx wrangler secret put TG_BOT_TOKEN`; for Feishu/Lark chat, see the Feishu/Lark configuration section below for `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_VERIFICATION_TOKEN`, and `FEISHU_ENCRYPT_KEY`.
5. **Launch**: Execute `npm install && npm run deploy`.

---

### 🔗 RSSFlow Integration Guide

Once deployed, you need to connect this bridge to your RSSFlow application:

1. **Get the URL**: After successful deployment, Cloudflare provides a URL ending in `.workers.dev` (e.g., `https://rssflow-bridge.yourname.workers.dev`).
2. **Configure RSSFlow**:
   - Open your RSSFlow client.
   - Navigate to **Settings** -> **MCP Settings**.
   - **Generate Identity Key**: Click "Generate New Key" to get a unique token (starting with `rf_v1_`).
   - **Save Settings**: Paste your deployed **Worker URL** and ensure the **Identity Key** is saved.

3.  **Usage of Identity Key (Crucial!)**:
    - **External MCP Clients (e.g., Cursor/Claude Desktop)**:
      - **Type**: Streamable HTTP (`streamableHttp`).
      - **URL**: Must include the key as a query parameter.
        - Example: `https://your-worker.dev/mcp?key=YOUR_IDENTITY_KEY`
    - **Telegram Binding**: Send `/bind YOUR_IDENTITY_KEY` to your bot to link the Telegram chat with your RSSFlow instance.

4. **Verify**: The client will automatically attempt to communicate with your MCP environment through the bridge.

---

### 🧰 Standard MCP Mode and Built-in Tools

Standard MCP mode is designed for MCP-compatible AI clients such as Cursor and Claude Desktop. After the client connects to `https://<your-worker>.workers.dev/mcp?key=YOUR_IDENTITY_KEY` via `streamableHttp`, it performs tool discovery first and then calls the built-in tools exposed by RSSFlow as needed.

#### 1. Connection Settings

- **Protocol type**: `streamableHttp`
- **Connection URL**: `https://<your-worker>.workers.dev/mcp?key=YOUR_IDENTITY_KEY`
- **Identity key**: The `rf_v1_` key generated in the RSSFlow client under **MCP Settings**.
- **Runtime dependency**: The browser running the RSSFlow extension must stay open; otherwise remote MCP requests cannot be polled and processed by the local client.

#### 2. Tool Discovery and Invocation Flow

1. The MCP client connects to the Worker's `/mcp` endpoint.
2. The Worker responds to standard MCP requests such as `initialize` and `tools/list`, returning the available tool list.
3. When the client invokes a tool, the Worker writes the request into the Cloudflare KV queue.
4. The local RSSFlow client polls the queue, executes the task, and sends the result back to the Worker.
5. The Worker returns the execution result to the MCP client.

#### 3. Built-in Tools

- `rssflow_list_actions`: Capability map tool. Lists the current RSSFlow system instructions, built-in AI shortcuts, and available tags. Use this first when you are unsure which tags or commands are available.
- `rssflow_query_summaries`: News data query tool. Fetches raw news items and AI summaries for specific tags or time ranges. Best for reading, analysis, summarization, and Q&A workflows that need source material.
- `rssflow_execute_command`: Preset task execution tool. Runs RSSFlow built-in analysis tasks or report-generation workflows. Best when the user explicitly asks for a fixed-format output such as a report, podcast script, tweet, or deep research brief.

#### 4. Usage Recommendations

- Call `rssflow_list_actions` first to retrieve available tags and commands before using `rssflow_query_summaries` or `rssflow_execute_command`; this reduces missing-tag or command-mismatch issues.
- Use `rssflow_query_summaries` when the AI should fetch source material and perform its own analysis; use `rssflow_execute_command` when RSSFlow already provides the desired preset workflow.
- Tool execution depends on the local RSSFlow client processing the queue. If the browser is closed or unreachable, MCP requests may time out.

---

### 🤖 Telegram Chat Configuration

This Worker supports two distinct modes:
1. **Standard MCP Mode**: For AI editors like Cursor/Claude Desktop, using `streamableHttp`.
2. **Telegram Chat Mode**: For direct dialogue, notifications, and commands via a Telegram Bot.

#### 1. Set Bot Token (TG_BOT_TOKEN)
You can set your bot key using either method:

- **Method A (CLI - Recommended)**: Run `npx wrangler secret put TG_BOT_TOKEN` and enter your token when prompted.
- **Method B (Cloudflare Dashboard)**: Go to your Worker -> **Settings** -> **Variables**. Under **Environment Variables**, click "Add variable". Name: `TG_BOT_TOKEN`, Value: your token. Click **Save and deploy**.

#### 2. Multi-Bot Support (Advanced)
If you need to connect multiple bots simultaneously:
- **Primary (Default) Bot**: Env name is `TG_BOT_TOKEN`.
- **Additional Bots**: Env name follows the format `TG_BOT_TOKEN_YOUR_ID` (e.g., `TG_BOT_TOKEN_MYBOT`).
- **Webhook Activation Link**:
  - Default: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-worker>.workers.dev/webhook/telegram/`
  - Named Bot: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-worker>.workers.dev/webhook/telegram/YOUR_ID`

---

### 🪽 Feishu/Lark Chat Configuration

Feishu/Lark chat mode lets you talk to RSSFlow AI, receive pushes, and send commands through a Feishu/Lark bot. It is configured separately from Standard MCP mode: MCP clients still use `/mcp?key=YOUR_IDENTITY_KEY`, while Feishu/Lark event callbacks use `/webhook/feishu`.

#### 1. Create a Feishu/Lark App and Enable Bot Capability

1. Go to the [Feishu Open Platform](https://open.feishu.cn/) and create an internal enterprise app.
2. In **Credentials & Basic Info**, copy the `App ID` and `App Secret`.
3. Enable **Bot** under **App Capabilities**, then publish or install the app into the target tenant or chat.

#### 2. Configure Worker Environment Variables

It is recommended to store sensitive values as Cloudflare Worker secrets. `FEISHU_APP_ID` and `FEISHU_APP_SECRET` are required for Feishu/Lark replies and proactive pushes. `FEISHU_VERIFICATION_TOKEN` and `FEISHU_ENCRYPT_KEY` are optional; configure them only when you want to enable Feishu/Lark token verification or event encryption/signature verification.

```bash
npx wrangler secret put FEISHU_APP_ID
npx wrangler secret put FEISHU_APP_SECRET
```

Optional security settings:

```bash
npx wrangler secret put FEISHU_VERIFICATION_TOKEN
npx wrangler secret put FEISHU_ENCRYPT_KEY
```

- `FEISHU_APP_ID`: The Feishu/Lark app ID. Used to obtain `tenant_access_token` and send messages.
- `FEISHU_APP_SECRET`: The Feishu/Lark app secret. Used to obtain `tenant_access_token` and send messages.
- `FEISHU_VERIFICATION_TOKEN` (optional): The Verification Token from Feishu/Lark event subscriptions. If this variable is not configured on the Worker, token verification is skipped.
- `FEISHU_ENCRYPT_KEY` (optional): The Encrypt Key from Feishu/Lark event subscriptions. When configured, the Worker verifies Feishu/Lark signatures and decrypts encrypted events. Configure it only if event encryption is enabled in Feishu/Lark or if you need signature verification.

You can also configure these values in the Cloudflare dashboard: Worker -> **Settings** -> **Variables**, then add them under **Environment Variables / Secrets** and click **Save and deploy**.

#### 3. Configure Feishu/Lark Event Subscriptions

1. In the Feishu Open Platform, open the app's **Events & Callbacks** page.
2. Set the **Request URL** to: `https://<your-worker>.workers.dev/webhook/feishu`.
3. If you want extra security checks, copy the Verification Token and Encrypt Key from Feishu/Lark into `FEISHU_VERIFICATION_TOKEN` and `FEISHU_ENCRYPT_KEY` on the Worker. They are not required for basic message receiving.
4. Add the event **Receive message v2.0** (event type `im.message.receive_v1`).
5. Save the configuration and ensure URL verification succeeds.

#### 4. Grant Permissions and Bind RSSFlow

1. Grant the required message permissions in the Feishu/Lark app, such as reading messages sent to the bot and sending messages to chats, then republish or reinstall the app as required by Feishu/Lark.
2. Generate an identity key in the RSSFlow client under **MCP Settings**. It usually starts with `rf_v1_`.
3. Send `/bind YOUR_IDENTITY_KEY` in a direct chat with the bot or in a group where the bot is installed.
4. After binding succeeds, send text messages to the bot to enter the RSSFlow chat flow. Non-text messages are ignored.

#### 5. Push and Reply Notes

- Feishu/Lark replies and proactive pushes depend on `FEISHU_APP_ID` and `FEISHU_APP_SECRET`. Without these two variables, the Worker can receive and bind events but cannot send replies to Feishu/Lark.
- After binding, the Worker records the mapping between the Feishu/Lark `chat_id` and the RSSFlow identity key. Later `/push` requests use the bound target by default if `platform` and `chatId` are not explicitly provided.

---

### ⚠️ Important Runtime Note

- **Browser Must Stay Open**: Since RSSFlow runs as a browser extension, **the browser where the extension is installed must remain open**. You don't need to keep the RSSFlow tab active, but the browser process must be running.
- **Host Environment**: The browser acts as the "host" for the MCP service. If the browser is closed, the remote gateway cannot reach your local data, causing MCP clients to time out.

## License
MIT
