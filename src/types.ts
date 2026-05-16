export type Platform = 'telegram' | 'feishu';

// 环境配置映射 (对应 wrangler.toml 中的 vars 和 bindings)
export interface Env {
  RSSFLOW_BRIDGE_KV: KVNamespace;
  TG_BOT_TOKEN: string;
  TG_BOT_USERNAME?: string;
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_VERIFICATION_TOKEN?: string;
  FEISHU_ENCRYPT_KEY?: string;
  [key: string]: any; // 支持动态获取 TG_BOT_TOKEN_2 等
}

// 绑定映射存储的信息
export interface BridgeConfig {
  platform: Platform;
  chatId: string;
  activated: boolean;
}

// 内部标准化消息实体 (隧道协议)
export interface InternalMessage {
  jsonrpc: "2.0";
  id: string; // msgId
  method: string; // 通常是 "mcp.chat" 或 "tools/call"
  _resultKey?: string; // MCP tools/call 结果回写 KV key
  params: {
    text?: string;
    [key: string]: any;
  };
  metadata: {
    source: Platform | 'mcp_remote';
    chatId?: string;
    chatType?: string;
    timestamp: number;
    botId?: string; // 机器人标识符 (例如 "2")
  };
}

// MCP Reply from Extension
export interface ExtensionReply {
  bridgeKey: string;
  msgId: string;
  text: string;
  parse_mode?: string;
  replyToMessageId?: number;
  platform?: Platform;
  chatId?: string;
  botId?: string;
}
