const http = require('http');

const BASE_URL = 'http://127.0.0.1:8787';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('--- RSSFlow MCP Bridge Local E2E Test ---');

  // 1. 模拟绑定 (Bind)
  console.log('\n[1] 模拟 Telegram /bind 请求...');
  const bindRes = await fetch(`${BASE_URL}/webhook/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: 123456789 },
        text: '/bind test_bridge_key_123'
      }
    })
  });
  console.log('Bind Response:', await bindRes.json());

  await delay(1000);

  // 2. 模拟用户发送问题 (Webhook Msg)
  console.log('\n[2] 模拟 Telegram 发送消息...');
  const msgRes = await fetch(`${BASE_URL}/webhook/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        message_id: 999,
        chat: { id: 123456789 },
        text: '/summary 近期的人工智能新闻'
      }
    })
  });
  console.log('Message Response:', await msgRes.json());

  await delay(1000);

  // 3. 模拟浏览器扩展拉取消息 (Poll)
  console.log('\n[3] 模拟扩展请求 /poll...');
  const pollRes = await fetch(`${BASE_URL}/poll?key=test_bridge_key_123`);
  const pollData = await pollRes.json();
  console.log('Poll Response:', pollData);
  
  if (!pollData.messages || pollData.messages.length === 0) {
    console.error('❌ Failed: 队列中没有消息！');
    return;
  }
  
  const msgId = pollData.messages[0].id;
  console.log('✅ 获取到了待处理的消息。MsgID:', msgId);

  await delay(1000);

  // 4. 模拟扩展回复处理完毕 (Reply & ACK)
  console.log('\n[4] 模拟扩展提交 /reply 并 ACK...');
  const replyRes = await fetch(`${BASE_URL}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bridgeKey: 'test_bridge_key_123',
      msgId: msgId,
      platform: 'telegram',
      chatId: '123456789',
      text: '🤖 以下是近期人工智能新闻的总结：\n1. O1 模型发布。'
    })
  });
  console.log('Reply Response:', await replyRes.json());

  await delay(1000);

  // 5. 再次验证队列已被清空
  console.log('\n[5] 再次请求 /poll 确认队列是否清空...');
  const pollRes2 = await fetch(`${BASE_URL}/poll?key=test_bridge_key_123`);
  const pollData2 = await pollRes2.json();
  console.log('Poll 2 Response:', pollData2);
  
  if (pollData2.messages && pollData2.messages.length === 0) {
    console.log('🎉 测试完美通过！ACK 防丢机制生效。');
  } else {
    console.error('❌ 队列未能清空！');
  }
}

runTest().catch(console.error);
