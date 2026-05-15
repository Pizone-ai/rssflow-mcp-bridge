import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { 
  bindBridgeKey, 
  getBridgeKeyByTarget, 
  enqueueMessage, 
  getMessages, 
  dequeueMessageAck 
} from './utils/kvHelper';

const app = new Hono<{ Bindings: Env }>();

// =========================================================================
// MCP 工具定义 (v4.0 - Discovery-First 闭环方案)
// =========================================================================
const MCP_TOOLS = [
  {
    name: 'rssflow_list_actions',
    description: '【能力地图】列出 RSSFlow 的系统说明、内置 AI 快捷指令以及可用标签。返回的 availableTags 必须作为 rssflow_query_summaries 或 rssflow_execute_command 的 tags 过滤参数使用。',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'rssflow_execute_command',
    description: '【预设任务执行】调用 RSSFlow 内置的特定分析任务或报告生成逻辑（如生成播客脚本、推文、深度研报）。仅当用户明确要求“生成报告”、“执行特定预设指令”或“进行特定格式加工”时使用。',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '指令的 ID 或名称（支持模糊匹配）'
        },
        timeRangeHours: {
          type: 'number',
          description: '分析过去多少小时内的数据，默认 24 小时',
          default: 24
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '必填：限定一个或多个标签（可从 rssflow_list_actions 获取可用标签）'
        }
      },
      required: ['command', 'tags']
    }
  },
  {
    name: 'rssflow_query_summaries',
    description: '【核心数据获取工具】获取指定领域、标签或时间范围内的资讯数据和摘要。如果你需要获取素材供你自己进行分析、总结或了解动态，应优先使用此工具。它提供文章标题、摘要、观点等原始数据，是所有分析任务的基础。',
    inputSchema: {
      type: 'object',
      properties: {
        timeRangeHours: {
          type: 'number',
          description: '查询过去多少小时内的数据，默认 24 小时',
          default: 24
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '必填：限定一个或多个标签'
        },
        limit: {
          type: 'number',
          description: '可选：返回结果的最大数量，上限为 100'
        }
      },
      required: ['tags']
    }
  }
];

const SERVER_INFO = {
  protocolVersion: "2024-11-05",
  capabilities: { tools: {}, logging: {} },
  serverInfo: { name: "RSSFlow-MCP-Server", version: "1.1.0" }
};

// =========================================================================
// 中间件与路由 (保持不变)
// =========================================================================
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Access-Control-Request-Private-Network'],
  credentials: true,
}));

app.options('*', (c) => {
  c.header('Access-Control-Allow-Private-Network', 'true');
  return c.body(null, 204);
});
app.get('/', (c) => c.text('RSSFlow MCP Gateway v2.1 (Discovery-First)'));

app.post('/mcp', async (c) => {
  const bridgeKey = c.req.query('key');
  if (!bridgeKey) return c.json({ error: 'Missing key' }, 401);
  
  const body = await c.req.json();
  const { method, id } = body;

  console.log(`[MCP] ${method} (ID: ${id})`);

  if (method === 'initialize') {
    return c.json({ jsonrpc: "2.0", id, result: SERVER_INFO });
  }
  if (method === 'ping') {
    return c.json({ jsonrpc: "2.0", id, result: {} });
  }
  if (method === 'tools/list') {
    return c.json({ jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } });
  }
  if (method === 'prompts/list') {
    return c.json({ jsonrpc: "2.0", id, result: { prompts: [] } });
  }
  if (method === 'resources/list') {
    return c.json({ jsonrpc: "2.0", id, result: { resources: [] } });
  }
  if (method?.startsWith('notifications/')) {
    return c.body(null, 202);
  }

  const RESULT_KEY = `mcp_tool_result:${bridgeKey}:${id}`;
  await c.env.RSSFLOW_BRIDGE_KV.delete(RESULT_KEY);
  
  await enqueueMessage(c.env, bridgeKey, {
    ...body,
    _resultKey: RESULT_KEY,
    metadata: { source: 'mcp_remote', timestamp: Date.now() }
  });

  for (let i = 0; i < 75; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const result = await c.env.RSSFLOW_BRIDGE_KV.get(RESULT_KEY);
    if (result) {
      c.env.RSSFLOW_BRIDGE_KV.delete(RESULT_KEY).catch(() => {});
      try { return c.json(JSON.parse(result)); } catch {}
      return c.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: result }] } });
    }
  }

  return c.json({
    jsonrpc: "2.0", id,
    error: { code: -32001, message: "Tool execution timed out. The browser extension may not be running or has not polled the bridge within 75 seconds." }
  });
});

// Streamable HTTP GET：规范要求返回 SSE 或 405
app.get('/mcp', (c) => c.body(null, 405));

// =========================================================================
// Webhook (Telegram)
// =========================================================================
app.post('/webhook/telegram/:botId?', async (c) => {
  const botId = c.req.param('botId');
  const body = await c.req.json();
  const message = body.message;
  if (!message?.chat || !message?.text) return c.json({ ok: true });
  const chatId = message.chat.id.toString();
  const text = message.text.trim();
  const botToken = getBotToken(c.env, botId);

  if (text.startsWith('/bind ')) {
    const key = text.replace('/bind ', '').trim();
    await bindBridgeKey(c.env, 'telegram', chatId, key);
    await sendTG(botToken, chatId, "✅ RSSFlow 绑定成功！Key: " + key);
    return c.json({ ok: true });
  }

  const bridgeKey = await getBridgeKeyByTarget(c.env, 'telegram', chatId);
  if (!bridgeKey) return c.json({ ok: true });

  await enqueueMessage(c.env, bridgeKey, {
    jsonrpc: "2.0", id: `msg_${Date.now()}`, method: "mcp.chat",
    params: { text, messageId: message.message_id },
    metadata: { source: 'telegram', chatId, timestamp: Date.now(), botId }
  });
  return c.json({ ok: true });
});

app.get('/poll', async (c) => {
  const bridgeKey = c.req.query('key');
  if (!bridgeKey) return c.json({ error: 'Missing key' }, 400);
  for (let i = 0; i < 5; i++) {
    const messages = await getMessages(c.env, bridgeKey);
    if (messages.length > 0) return c.json({ success: true, messages });
    await new Promise(r => setTimeout(r, 1000));
  }
  return c.json({ success: true, messages: [], status: 'keep-alive' });
});

app.get('/debug_queue', async (c) => {
  const bridgeKey = c.req.query('key');
  if (!bridgeKey) return c.json({ error: 'Missing key' }, 400);

  const messages = await getMessages(c.env, bridgeKey);
  return c.json({
    success: true,
    count: messages.length,
    messages: messages.map((msg) => ({
      id: msg.id,
      method: msg.method,
      tool: msg.params?.name,
      hasResultKey: Boolean(msg._resultKey),
      source: msg.metadata?.source,
      ageMs: msg.metadata?.timestamp ? Date.now() - msg.metadata.timestamp : null
    }))
  });
});

app.post('/reply', async (c) => {
  const body = await c.req.json();
  const { bridgeKey, text, platform, chatId, botId, msgId } = body;
  if (!bridgeKey || !text) return c.json({ error: 'Missing params' }, 400);

  if (platform === 'telegram') {
    await sendTG(getBotToken(c.env, botId), chatId, text, 'Markdown');
  }

  if (msgId) await dequeueMessageAck(c.env, bridgeKey, msgId);
  return c.json({ success: true });
});

app.post('/ack', async (c) => {
  const { bridgeKey, msgId } = await c.req.json();
  if (!bridgeKey || !msgId) return c.json({ error: 'Missing bridgeKey or msgId' }, 400);
  await dequeueMessageAck(c.env, bridgeKey, msgId);
  return c.json({ success: true });
});

app.post('/kv_put', async (c) => {
  const { key, value, ttl } = await c.req.json();
  if (!key || !value) return c.json({ error: 'Missing key or value' }, 400);
  if (!key.startsWith('mcp_tool_result:')) return c.json({ error: 'Forbidden key prefix' }, 403);
  
  await c.env.RSSFLOW_BRIDGE_KV.put(key, value, { expirationTtl: Math.max(ttl || 60, 60) });
  return c.json({ success: true });
});

function getBotToken(env: Env, botId?: string): string {
  const key = botId ? `TG_BOT_TOKEN_${botId}` : 'TG_BOT_TOKEN';
  return env[key] || env.TG_BOT_TOKEN;
}

async function sendTG(token: string, chatId: string, text: string, parse_mode?: string) {
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode })
  });
}

export default app;
