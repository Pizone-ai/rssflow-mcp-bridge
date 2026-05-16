import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { 
  bindBridgeKey, 
  getBridgeKeyByTarget, 
  enqueueMessage, 
  getMessages, 
  dequeueMessageAck,
  getBridgeConfig
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
  
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

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

  if (id === undefined || id === null) {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request: missing id" } }, 400);
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
  const chatType = message.chat.type;
  const botToken = getBotToken(c.env, botId);
  const botUsername = getTelegramBotUsername(c.env, botId);
  const normalized = normalizeTelegramMessage(message, botUsername);
  if (!normalized.shouldHandle || !normalized.text) return c.json({ ok: true });
  const text = normalized.text;

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
    metadata: { source: 'telegram', chatId, chatType, timestamp: Date.now(), botId }
  });
  return c.json({ ok: true });
});

// =========================================================================
// Webhook (Feishu/Lark)
// =========================================================================
app.post('/webhook/feishu', async (c) => {
  const rawBody = await c.req.text();
  let body: any;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // 1. 响应 URL 验证
  if (body.type === 'url_verification') {
    const tokenCheck = verifyFeishuVerificationToken(c.env, body);
    if (!tokenCheck.ok) return c.json({ error: tokenCheck.error }, 403);
    return c.json({ challenge: body.challenge });
  }

  const signatureCheck = await verifyFeishuSignature(c.env, c.req.raw.headers, rawBody);
  if (!signatureCheck.ok) return c.json({ error: signatureCheck.error }, 403);

  const normalizedBodyResult = await normalizeFeishuEventBody(c.env, body);
  if (!normalizedBodyResult.ok) return c.json({ error: normalizedBodyResult.error }, 400);

  body = normalizedBodyResult.body;

  const tokenCheck = verifyFeishuVerificationToken(c.env, body);
  if (!tokenCheck.ok) return c.json({ error: tokenCheck.error }, 403);

  if (body.type === 'url_verification') {
    return c.json({ challenge: body.challenge });
  }

  // 2. 响应事件回调 (v2.0 格式)
  if (body.header && body.event) {
    const { event_type } = body.header;
    
    // 只处理消息接收事件
    if (event_type === 'im.message.receive_v1') {
      const { message } = body.event;
      if (message.message_type !== 'text') return c.json({ ok: true });

      const chatId = message.chat_id;
      const chatType = message.chat_type; // 'p2p' or 'group'
      const messageId = message.message_id;
      
      let text = extractFeishuText(message.content);

      // 在群聊中，机器人收到的消息通常带有艾特它的占位符（不论是在开头还是中间）
      // 飞书文本格式中艾特可能是 <at user_id="xxx">名称</at>、@_user_1 或 @机器人名
      // 这里统一移除艾特标记，以提取真实意图，确保群聊里「@机器人 /bind key」能命中绑定逻辑
      if (chatType === 'group') {
        text = normalizeFeishuText(text);
      }

      if (!text) return c.json({ ok: true });

      // 绑定逻辑
      if (text.startsWith('/bind ')) {
        const key = text.replace('/bind ', '').trim();
        await bindBridgeKey(c.env, 'feishu', chatId, key);
        const appId = c.env.FEISHU_APP_ID;
        const appSecret = c.env.FEISHU_APP_SECRET;
        if (appId && appSecret) {
          await sendFeishu(c.env, appId, appSecret, chatId, "✅ RSSFlow 绑定成功！Key: " + key);
        }
        return c.json({ ok: true });
      }

      const bridgeKey = await getBridgeKeyByTarget(c.env, 'feishu', chatId);
      if (!bridgeKey) return c.json({ ok: true });

      await enqueueMessage(c.env, bridgeKey, {
        jsonrpc: "2.0", id: `msg_${Date.now()}`, method: "mcp.chat",
        params: { text, messageId },
        metadata: { 
          source: 'feishu', 
          chatId, 
          chatType,
          timestamp: Date.now() 
        }
      });
    }
  }

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
  const { bridgeKey, text, platform, chatId, botId, msgId, feishuAppId, feishuAppSecret } = body;
  if (!bridgeKey || !text) return c.json({ error: 'Missing params' }, 400);

  let targetPlatform = platform;
  let targetChatId = chatId;

  if (!targetPlatform || !targetChatId) {
    const config = await getBridgeConfig(c.env, bridgeKey);
    if (config) {
      targetPlatform = targetPlatform || config.platform;
      targetChatId = targetChatId || config.chatId;
    }
  }

  if (!targetPlatform || !targetChatId) {
    return c.json({ error: 'Missing reply target. Provide platform/chatId or bind this bridgeKey first.' }, 400);
  }

  if (targetPlatform === 'telegram') {
    const result = await sendTG(getBotToken(c.env, botId), targetChatId, text, 'Markdown');
    if (!result.ok) return c.json({ error: result.error }, 502);
  } else if (targetPlatform === 'feishu') {
    const appId = feishuAppId || c.env.FEISHU_APP_ID;
    const appSecret = feishuAppSecret || c.env.FEISHU_APP_SECRET;
    if (!appId || !appSecret) {
      return c.json({ error: 'Feishu credentials missing on bridge' }, 400);
    }
    const result = await sendFeishu(c.env, appId, appSecret, targetChatId, text);
    if (!result.ok) {
      return c.json({ error: result.error }, 502);
    }
  } else {
    return c.json({ error: `Unsupported reply platform: ${targetPlatform}` }, 400);
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

app.post('/push', async (c) => {
  const body = await c.req.json();
  const { bridgeKey, text, platform: overridePlatform, chatId: overrideChatId, feishuAppId, feishuAppSecret, botId } = body;
  
  if (!bridgeKey || !text) return c.json({ error: 'Missing bridgeKey or text' }, 400);

  let targetPlatform = overridePlatform;
  let targetChatId = overrideChatId;

  // 如果没有提供明确的 platform/chatId，尝试从绑定配置中读取
  if (!targetPlatform || !targetChatId) {
    const config = await getBridgeConfig(c.env, bridgeKey);
    if (config) {
      targetPlatform = targetPlatform || config.platform;
      targetChatId = targetChatId || config.chatId;
    }
  }

  if (!targetPlatform || !targetChatId) {
    return c.json({ error: 'No bound target found for this bridgeKey. Please /bind first.' }, 404);
  }

  if (targetPlatform === 'telegram') {
    const result = await sendTG(getBotToken(c.env, botId), targetChatId, text, 'Markdown');
    if (!result.ok) return c.json({ error: result.error }, 502);
  } else if (targetPlatform === 'feishu') {
    const appId = feishuAppId || c.env.FEISHU_APP_ID;
    const appSecret = feishuAppSecret || c.env.FEISHU_APP_SECRET;
    if (appId && appSecret) {
      const result = await sendFeishu(c.env, appId, appSecret, targetChatId, text);
      if (!result.ok) return c.json({ error: result.error }, 502);
    } else {
      return c.json({ error: 'Feishu credentials missing on bridge' }, 400);
    }
  } else {
    return c.json({ error: `Unsupported push platform: ${targetPlatform}` }, 400);
  }

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

function getTelegramBotUsername(env: Env, botId?: string): string | undefined {
  const key = botId ? `TG_BOT_USERNAME_${botId}` : 'TG_BOT_USERNAME';
  const username = env[key] || env.TG_BOT_USERNAME;
  return typeof username === 'string' ? username.replace(/^@/, '').trim() : undefined;
}

async function sendTG(token: string, chatId: string, text: string, parse_mode?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Telegram bot token missing on bridge' };
  if (!chatId) return { ok: false, error: 'Missing Telegram chatId' };

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode })
  });

  const data: any = await resp.json().catch(() => null);
  if (!resp.ok || data?.ok === false) {
    return { ok: false, error: `Telegram send failed: ${data?.description || resp.statusText || resp.status}` };
  }

  return { ok: true };
}

function normalizeTelegramText(text: string, botId?: string): string {
  const trimmed = text.trim();
  if (/^\/\w+@[^\s]+/i.test(trimmed)) {
    return trimmed.replace(/^(\/\w+)@[^\s]+/i, '$1').trim();
  }
  if (!botId) return trimmed;

  return trimmed.replace(new RegExp(`^(/\\w+)@${escapeRegExp(botId)}\\b`, 'i'), '$1').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTelegramMessage(message: any, botUsername?: string): { shouldHandle: boolean; text: string } {
  const rawText = typeof message?.text === 'string' ? message.text.trim() : '';
  if (!rawText) return { shouldHandle: false, text: '' };

  const chatType = message?.chat?.type;
  if (chatType === 'private') {
    return { shouldHandle: true, text: normalizeTelegramText(rawText, botUsername) };
  }

  const directCommandMatch = rawText.match(/^(\/\w+)(?:@([^\s]+))?(?:\s+([\s\S]*))?$/i);
  if (directCommandMatch) {
    const [, command, targetUsername, rest = ''] = directCommandMatch;
    if (targetUsername && isSameTelegramUsername(targetUsername, botUsername)) {
      return { shouldHandle: true, text: `${command} ${rest}`.trim() };
    }

    if (!targetUsername && command.toLowerCase() === '/bind') {
      return { shouldHandle: true, text: `${command} ${rest}`.trim() };
    }
  }

  if (botUsername) {
    const mentionPattern = new RegExp(`^@${escapeRegExp(botUsername)}(?:\\s+|$)`, 'i');
    if (mentionPattern.test(rawText)) {
      return { shouldHandle: true, text: rawText.replace(mentionPattern, '').trim() };
    }

    const repliedToBot = message?.reply_to_message?.from?.is_bot === true
      && isSameTelegramUsername(message?.reply_to_message?.from?.username, botUsername);
    if (repliedToBot) {
      return { shouldHandle: true, text: normalizeTelegramText(rawText, botUsername) };
    }
  }

  return { shouldHandle: false, text: '' };
}

function isSameTelegramUsername(actual: unknown, expected?: string): boolean {
  return typeof actual === 'string' && typeof expected === 'string' && actual.toLowerCase() === expected.toLowerCase();
}

async function getFeishuToken(env: Env, appId: string, appSecret: string): Promise<string | null> {
  const CACHE_KEY = `feishu_token:${appId}`;
  const cached = await env.RSSFLOW_BRIDGE_KV.get(CACHE_KEY);
  if (cached) return cached;

  const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  
  const data: any = await resp.json();
  if (data.code === 0 && data.tenant_access_token) {
    // 缓存 Token，比有效期少 1 分钟以保安全
    await env.RSSFLOW_BRIDGE_KV.put(CACHE_KEY, data.tenant_access_token, { 
      expirationTtl: Math.max(60, data.expire - 60) 
    });
    return data.tenant_access_token;
  }
  return null;
}

async function sendFeishu(env: Env, appId: string, appSecret: string, chatId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await getFeishuToken(env, appId, appSecret);
  if (!token) return { ok: false, error: 'Failed to acquire Feishu tenant_access_token' };

  const resp = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text })
    })
  });

  const data: any = await resp.json().catch(() => null);
  if (!resp.ok || (data && typeof data.code === 'number' && data.code !== 0)) {
    return { ok: false, error: `Feishu send failed: ${data?.msg || data?.message || resp.statusText || resp.status}` };
  }

  return { ok: true };
}

function extractFeishuText(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return typeof parsed?.text === 'string' ? parsed.text.trim() : '';
  } catch {
    return '';
  }
}

function normalizeFeishuText(text: string): string {
  return text
    .replace(/<at\b[^>]*>[\s\S]*?<\/at>/g, ' ')
    .replace(/@_user_[\w-]+/g, ' ')
    .replace(/^@[\S]+\s+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function verifyFeishuVerificationToken(env: Env, body: any): { ok: true } | { ok: false; error: string } {
  const expectedToken = env.FEISHU_VERIFICATION_TOKEN;
  if (!expectedToken) return { ok: true };

  const actualToken = body?.token || body?.header?.token;
  if (actualToken !== expectedToken) {
    return { ok: false, error: 'Invalid Feishu verification token' };
  }

  return { ok: true };
}

async function verifyFeishuSignature(env: Env, headers: Headers, rawBody: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const encryptKey = env.FEISHU_ENCRYPT_KEY;
  if (!encryptKey) return { ok: true };

  const timestamp = headers.get('X-Lark-Request-Timestamp') || headers.get('x-lark-request-timestamp');
  const nonce = headers.get('X-Lark-Request-Nonce') || headers.get('x-lark-request-nonce');
  const signature = headers.get('X-Lark-Signature') || headers.get('x-lark-signature');

  if (!timestamp || !nonce || !signature) {
    return { ok: false, error: 'Missing Feishu signature headers' };
  }

  const expectedSignature = await sha256Hex(`${timestamp}${nonce}${encryptKey}${rawBody}`);
  if (!safeEqual(expectedSignature, signature)) {
    return { ok: false, error: 'Invalid Feishu signature' };
  }

  return { ok: true };
}

async function normalizeFeishuEventBody(env: Env, body: any): Promise<{ ok: true; body: any } | { ok: false; error: string }> {
  if (!body?.encrypt) return { ok: true, body };

  const encryptKey = env.FEISHU_ENCRYPT_KEY;
  if (!encryptKey) {
    return { ok: false, error: 'Encrypted Feishu event received but FEISHU_ENCRYPT_KEY is not configured' };
  }

  try {
    const decryptedText = await decryptFeishuEvent(body.encrypt, encryptKey);
    return { ok: true, body: JSON.parse(decryptedText) };
  } catch (error: any) {
    return { ok: false, error: `Failed to decrypt Feishu event: ${error?.message || error}` };
  }
}

async function decryptFeishuEvent(encryptedPayload: string, encryptKey: string): Promise<string> {
  const encryptedBytes = base64ToBytes(encryptedPayload);
  if (encryptedBytes.length <= 16) throw new Error('ciphertext too short');

  const keyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encryptKey));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
  const iv = encryptedBytes.slice(0, 16);
  const ciphertext = encryptedBytes.slice(16);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, ciphertext);

  return new TextDecoder().decode(decrypted).trim();
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export default app;
