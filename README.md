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
4. **Secrets** (Optional): Run `npx wrangler secret put TG_BOT_TOKEN`.
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

### ⚠️ Important Runtime Note

- **Browser Must Stay Open**: Since RSSFlow runs as a browser extension, **the browser where the extension is installed must remain open**. You don't need to keep the RSSFlow tab active, but the browser process must be running.
- **Host Environment**: The browser acts as the "host" for the MCP service. If the browser is closed, the remote gateway cannot reach your local data, causing MCP clients to time out.

---

### 🛠 Tools Included
- `rssflow_list_actions`: List available commands and tags.
- `rssflow_query_summaries`: Fetch news data and AI summaries.
- `rssflow_execute_command`: Execute specific preset analysis tasks.

---

## License
MIT
