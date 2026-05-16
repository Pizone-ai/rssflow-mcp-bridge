import { Env, InternalMessage, BridgeConfig } from '../types';

/**
 * 将消息加入 KV 队列 (回滚到数组模式：CF KV 的 list() 索引延迟高达 60s，无法用于队列扫描)
 */
export async function enqueueMessage(env: Env, bridgeKey: string, message: InternalMessage): Promise<void> {
  const queueKey = `queue:${bridgeKey}`;
  
  // 乐观读取
  const queue = await readQueue(env, queueKey);
  
  queue.push(message);
  
  // 写回 KV，设置 TTL 保证不过度挤压
  await env.RSSFLOW_BRIDGE_KV.put(queueKey, JSON.stringify(queue), { expirationTtl: 300 });
}

/**
 * 获取某个 Key 的所有排队消息 (长轮询用，不删除) - 【数组直取模式，绕过 list 索引延迟】
 */
export async function getMessages(env: Env, bridgeKey: string): Promise<InternalMessage[]> {
  const queueKey = `queue:${bridgeKey}`;
  // get 远快于 list，通常修改后能在 1s 内同步到最近的 Edge 节点
  return readQueue(env, queueKey);
}

/**
 * 根据 msgId 从队列中移除已处理的消息 (ACK)
 */
export async function dequeueMessageAck(env: Env, bridgeKey: string, msgId: string): Promise<void> {
  const queueKey = `queue:${bridgeKey}`;
  let queue = await readQueue(env, queueKey);
  if (queue.length === 0) return;
  const initialLength = queue.length;
  
  // 过滤掉已处理的
  queue = queue.filter(msg => msg.id !== msgId);
  
  if (queue.length !== initialLength) {
    if (queue.length === 0) {
      // 队列空了，连 Key 一起删掉省空间
      await env.RSSFLOW_BRIDGE_KV.delete(queueKey);
    } else {
      await env.RSSFLOW_BRIDGE_KV.put(queueKey, JSON.stringify(queue), { expirationTtl: 300 });
    }
  }
}

/**
 * 验证和获取绑定信息
 */
export async function getBridgeConfig(env: Env, bridgeKey: string): Promise<BridgeConfig | null> {
  const configStr = await env.RSSFLOW_BRIDGE_KV.get(`config:${bridgeKey}`);
  return parseJsonOrNull<BridgeConfig>(configStr);
}

/**
 * 将 IM 频道的 ID 关联至 BridgeKey
 */
export async function bindBridgeKey(env: Env, platform: string, chatId: string, bridgeKey: string): Promise<void> {
  // 建立反向映射 target -> bridgeKey
  await env.RSSFLOW_BRIDGE_KV.put(`target:${platform}:${chatId}`, bridgeKey);
  
  // 建立正向映射 config:bridgeKey -> details
  const config: BridgeConfig = {
    platform: platform as any,
    chatId: chatId,
    activated: true
  };
  await env.RSSFLOW_BRIDGE_KV.put(`config:${bridgeKey}`, JSON.stringify(config));
}

/**
 * 通过平台+ChatID 查询当前绑定的 BridgeKey
 */
export async function getBridgeKeyByTarget(env: Env, platform: string, chatId: string): Promise<string | null> {
  return await env.RSSFLOW_BRIDGE_KV.get(`target:${platform}:${chatId}`);
}

async function readQueue(env: Env, queueKey: string): Promise<InternalMessage[]> {
  const currentStr = await env.RSSFLOW_BRIDGE_KV.get(queueKey);
  const queue = parseJsonOrNull<InternalMessage[]>(currentStr);
  return Array.isArray(queue) ? queue : [];
}

function parseJsonOrNull<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
