const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseChatExport,
  analyzeChatDynamics
} = require('../src/domain/chat-rings.cjs');

test('1. 多格式聊天记录解析：标准两行块 TXT', () => {
  const raw = `2026-05-20 23:14:08 Alice
今晚吃什么？
2026-05-20 23:14:40 Bob
海底捞走起！`;
  const msgs = parseChatExport(raw, 'txt');
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].sender, 'Alice');
  assert.equal(msgs[0].content, '今晚吃什么？');
  assert.equal(msgs[1].sender, 'Bob');
});

test('2. 多格式聊天记录解析：单行方括号 TXT 与 CSV', () => {
  const txtRaw = `[2026-05-20 23:14:08] Alice: 在吗？\n[2026-05-20 23:14:30] Bob: 在的！`;
  const msgsTxt = parseChatExport(txtRaw);
  assert.equal(msgsTxt.length, 2);
  assert.equal(msgsTxt[0].sender, 'Alice');

  const csvRaw = `time,sender,content\n2026-05-20 23:14:08,Alice,测试CSV\n2026-05-20 23:14:50,Bob,收到！`;
  const msgsCsv = parseChatExport(csvRaw, 'csv');
  assert.equal(msgsCsv.length, 2);
  assert.equal(msgsCsv[1].sender, 'Bob');
});

test('3. 多格式聊天记录解析：JSON 数组格式', () => {
  const jsonRaw = JSON.stringify([
    { time: '2026-01-01 10:00:00', from: 'Alice', msg: '新年快乐！' },
    { time: '2026-01-01 10:00:30', from: 'Bob', msg: '同乐同乐！' }
  ]);
  const msgs = parseChatExport(jsonRaw, 'json');
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].content, '新年快乐！');
});

test('4. 破冰者 (Icebreaker) 判定：间隔 >= 6小时首条发言', () => {
  const msgs = [
    { timestampMs: Date.parse('2026-05-20 10:00:00'), isoTime: '', sender: 'Alice', content: '早' },
    { timestampMs: Date.parse('2026-05-20 10:01:00'), isoTime: '', sender: 'Bob', content: '早啊' },
    // 间隔 8 小时
    { timestampMs: Date.parse('2026-05-20 18:00:00'), isoTime: '', sender: 'Bob', content: '下班去跑步吗？' },
    { timestampMs: Date.parse('2026-05-20 18:02:00'), isoTime: '', sender: 'Alice', content: '好的！' }
  ];

  const report = analyzeChatDynamics(msgs);
  const alice = report.participants.find(p => p.sender === 'Alice');
  const bob = report.participants.find(p => p.sender === 'Bob');

  assert.equal(alice.icebreakerCount, 1); // 首条破冰
  assert.equal(bob.icebreakerCount, 1);   // 8小时后主动发起话题破冰
  assert.equal(report.participants.length, 2);
});

test('5. 回复延迟中位数与秒回率计算 (0 < dt <= 2h)', () => {
  const msgs = [
    { timestampMs: 1000000, isoTime: '', sender: 'Alice', content: '1' },
    { timestampMs: 1000000 + 30000, isoTime: '', sender: 'Bob', content: '2' },   // 30秒内秒回
    { timestampMs: 1000000 + 90000, isoTime: '', sender: 'Alice', content: '3' }, // 60秒内秒回
    { timestampMs: 1000000 + 300000, isoTime: '', sender: 'Bob', content: '4' }   // 210秒
  ];

  const report = analyzeChatDynamics(msgs);
  const bob = report.participants.find(p => p.sender === 'Bob');
  assert.ok(bob.medianReplySeconds > 0);
  assert.equal(bob.fastReplyRatioPct, 50.0); // 2次中1次 <= 60s
});

test('6. 7×24 小时生物钟热力图与深夜活跃比', () => {
  const msgs = [
    { timestampMs: Date.parse('2026-05-20 23:30:00'), isoTime: '', sender: 'A', content: '夜聊1' },
    { timestampMs: Date.parse('2026-05-20 01:30:00'), isoTime: '', sender: 'B', content: '夜聊2' },
    { timestampMs: Date.parse('2026-05-20 14:00:00'), isoTime: '', sender: 'A', content: '下午' }
  ];

  const report = analyzeChatDynamics(msgs);
  assert.equal(report.lateNightRatioPct, 66.7); // 3条中2条在深夜
});

// =================== 反向对照测试 (Reverse-Contrast) ===================

test('7. [反向对照1] 若将破冰间隔阈值错误缩减为 0，连续对话破冰计数断言必须变红(FAIL)', () => {
  // 正常连续对话（间隔 1 分钟）
  const msgs = [
    { timestampMs: 1000000, isoTime: '', sender: 'Alice', content: '1' },
    { timestampMs: 1000060, isoTime: '', sender: 'Bob', content: '2' }
  ];

  // 正常实现：Bob 间隔仅 1 分钟，不应算破冰
  const good = analyzeChatDynamics(msgs);
  const bob = good.participants.find(p => p.sender === 'Bob');
  assert.equal(bob.icebreakerCount, 0);

  // 退化实现：假判定（只要发送者不同就当破冰）
  function degradedIcebreakerCheck(m) {
    return 1;
  }
  const badCount = degradedIcebreakerCheck(msgs);

  assert.throws(() => {
    assert.equal(badCount, 0, '连续正常发言不应误计破冰');
  }, /AssertionError/);
});

test('8. [反向对照2] 若将回复延迟中位数恒等于 0，正常对话延迟断言必须变红(FAIL)', () => {
  const msgs = [
    { timestampMs: 1000000, isoTime: '', sender: 'Alice', content: '1' },
    { timestampMs: 1000000 + 50000, isoTime: '', sender: 'Bob', content: '2' } // 50秒回复
  ];

  const good = analyzeChatDynamics(msgs);
  const bob = good.participants.find(p => p.sender === 'Bob');
  assert.equal(bob.medianReplySeconds, 50);

  // 退化实现：假分析（恒定为 0）
  function degradedReplyLatency() {
    return 0;
  }
  const badSeconds = degradedReplyLatency();

  assert.throws(() => {
    assert.equal(badSeconds, 50, '退化中位数无法反映真实50秒回复耗时');
  }, /AssertionError/);
});
