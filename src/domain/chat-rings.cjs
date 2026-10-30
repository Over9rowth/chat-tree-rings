// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
/**
 * 聊天记录年轮 (chat-tree-rings) - 核心算法域
 * 100% 按照 SPEC.md 锁定的多格式解析与互动动力学公式实现
 */

const STOP_WORDS = new Set('的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样想关各春向情者意'.split(''));

/**
 * 自动识别并解析 TXT / CSV / JSON 多格式聊天记录
 */
function parseChatExport(rawText, formatHint = 'auto') {
  if (!rawText || typeof rawText !== 'string') return [];

  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // 1. JSON 格式检测
  if (formatHint === 'json' || (formatHint === 'auto' && trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const list = [];
        for (const item of parsed) {
          const timeVal = item.timestampMs || item.timestamp || item.time || item.date;
          let ts = typeof timeVal === 'number' ? timeVal : Date.parse(String(timeVal));
          if (isNaN(ts)) ts = Date.now();

          const sender = String(item.sender || item.from || item.user || item.author || '未知');
          const content = String(item.content || item.text || item.msg || item.message || '');
          list.push({
            timestampMs: ts,
            isoTime: new Date(ts).toISOString(),
            sender,
            content
          });
        }
        list.sort((a, b) => a.timestampMs - b.timestampMs);
        return list;
      }
    } catch { /* 退回其它解析方式 */ }
  }

  // 2. CSV 格式检测
  const lines = trimmed.split(/\r?\n/);
  if (formatHint === 'csv' || (formatHint === 'auto' && lines[0].toLowerCase().includes('time') && lines[0].includes(','))) {
    const list = [];
    // 简单解析首行表头
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length >= 3) {
        const timeStr = parts[0].trim();
        const sender = parts[1].trim();
        const content = parts.slice(2).join(',').trim();
        let ts = Date.parse(timeStr);
        if (isNaN(ts)) ts = Date.now();
        list.push({
          timestampMs: ts,
          isoTime: new Date(ts).toISOString(),
          sender,
          content
        });
      }
    }
    if (list.length > 0) {
      list.sort((a, b) => a.timestampMs - b.timestampMs);
      return list;
    }
  }

  // 3. TXT 格式解析：支持单行 [YYYY-MM-DD HH:mm:ss] 昵称: 内容 与两行块格式
  const list = [];
  const singleLineRegex = /^\[?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\]?\s+([^:：]+)[:：]\s*(.*)$/;
  const blockHeaderRegex = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.*)$/;

  let currentMsg = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const singleMatch = line.match(singleLineRegex);
    if (singleMatch) {
      if (currentMsg) list.push(currentMsg);
      const timeStr = singleMatch[1];
      const sender = singleMatch[2].trim();
      const content = singleMatch[3] || '';
      let ts = Date.parse(timeStr.replace(/\./g, '-'));
      if (isNaN(ts)) ts = Date.now();
      currentMsg = { timestampMs: ts, isoTime: new Date(ts).toISOString(), sender, content };
      continue;
    }

    const blockMatch = line.match(blockHeaderRegex);
    if (blockMatch) {
      if (currentMsg) list.push(currentMsg);
      const timeStr = blockMatch[1];
      const sender = blockMatch[2].trim();
      let ts = Date.parse(timeStr.replace(/\./g, '-'));
      if (isNaN(ts)) ts = Date.now();
      currentMsg = { timestampMs: ts, isoTime: new Date(ts).toISOString(), sender, content: '' };
      continue;
    }

    if (currentMsg) {
      currentMsg.content = currentMsg.content ? `${currentMsg.content}\n${line}` : line;
    }
  }

  if (currentMsg) list.push(currentMsg);

  list.sort((a, b) => a.timestampMs - b.timestampMs);
  return list;
}

/**
 * 互动动力学与年轮分析引擎
 */
function analyzeChatDynamics(messages) {
  if (!messages || messages.length === 0) {
    return {
      totalMessages: 0,
      totalChars: 0,
      participants: [],
      heatmap7x24: Array.from({ length: 7 }, () => new Array(24).fill(0)),
      lateNightRatioPct: 0,
      peakHour: 0,
      monthlyRings: [],
      longestStreakDays: 0,
      longestGapDays: 0,
      topWords: []
    };
  }

  const totalMessages = messages.length;
  let totalChars = 0;

  // 7x24 矩阵 [dayOfWeek (0=周一..6=周日)][hour (0..23)]
  const heatmap7x24 = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let lateNightCount = 0; // 22:00 ~ 03:59
  const hourCounts = new Array(24).fill(0);

  // 统计双方参与者
  const senderMap = new Map();
  // 回复延迟样本池：Map<sender, number[]> (单位: 秒)
  const replyLatenciesMap = new Map();
  // 破冰统计：Map<sender, number>
  const icebreakerMap = new Map();

  const SIX_HOURS_MS = 6 * 3600 * 1000;
  const TWO_HOURS_SEC = 2 * 3600;

  // 首条消息计为一次破冰
  if (messages.length > 0) {
    icebreakerMap.set(messages[0].sender, 1);
  }

  const distinctDays = new Set();
  const monthlyRingsMap = new Map();
  const wordFreqMap = new Map();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const cLen = msg.content ? msg.content.length : 0;
    totalChars += cLen;

    // 参与者累计
    const pData = senderMap.get(msg.sender) || { messageCount: 0, charCount: 0 };
    pData.messageCount++;
    pData.charCount += cLen;
    senderMap.set(msg.sender, pData);

    const d = new Date(msg.timestampMs);
    // JS getDay(): 0=周日, 1=周一... -> 转为 0=周一..6=周日
    const jsDay = d.getDay();
    const dayOfWeek = (jsDay + 6) % 7;
    const hour = d.getHours();

    heatmap7x24[dayOfWeek][hour]++;
    hourCounts[hour]++;

    if (hour >= 22 || hour < 4) {
      lateNightCount++;
    }

    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    distinctDays.add(dayKey);

    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mData = monthlyRingsMap.get(monthKey) || { totalCount: 0, charCount: 0, bySender: {} };
    mData.totalCount++;
    mData.charCount += cLen;
    mData.bySender[msg.sender] = (mData.bySender[msg.sender] || 0) + 1;
    monthlyRingsMap.set(monthKey, mData);

    // 破冰者与回复延迟计算
    if (i > 0) {
      const prevMsg = messages[i - 1];
      const dtMs = msg.timestampMs - prevMsg.timestampMs;

      // 1. 破冰判定：间隔 >= 6 小时
      if (dtMs >= SIX_HOURS_MS) {
        icebreakerMap.set(msg.sender, (icebreakerMap.get(msg.sender) || 0) + 1);
      }

      // 2. 回复延迟判定：交替发言且 0 < dt <= 2 小时
      if (prevMsg.sender !== msg.sender && dtMs > 0 && dtMs <= TWO_HOURS_SEC * 1000) {
        const dtSec = Math.max(1, Math.round(dtMs / 1000));
        const lList = replyLatenciesMap.get(msg.sender) || [];
        lList.push(dtSec);
        replyLatenciesMap.set(msg.sender, lList);
      }
    }

    // 简单中文实义词词频提取
    const words = msg.content.match(/[\u4e00-\u9fa5]{2,6}/g);
    if (words) {
      for (const w of words) {
        if (!STOP_WORDS.has(w)) {
          wordFreqMap.set(w, (wordFreqMap.get(w) || 0) + 1);
        }
      }
    }
  }

  // 峰值小时
  let peakHour = 0;
  let maxHourCount = -1;
  for (let h = 0; h < 24; h++) {
    if (hourCounts[h] > maxHourCount) {
      maxHourCount = hourCounts[h];
      peakHour = h;
    }
  }

  const lateNightRatioPct = Number(((lateNightCount / totalMessages) * 100).toFixed(1));

  // 汇总参与者指标
  let totalIcebreakers = 0;
  for (const count of icebreakerMap.values()) totalIcebreakers += count;

  const participants = [];
  for (const [sender, pData] of senderMap.entries()) {
    const ibCount = icebreakerMap.get(sender) || 0;
    const icebreakerRatioPct = totalIcebreakers > 0 ? Number(((ibCount / totalIcebreakers) * 100).toFixed(1)) : 0;

    const latList = replyLatenciesMap.get(sender) || [];
    let medianReplySeconds = 0;
    let fastReplyRatioPct = 0;

    if (latList.length > 0) {
      latList.sort((a, b) => a - b);
      medianReplySeconds = latList[Math.floor(latList.length / 2)];
      const fastCount = latList.filter(s => s <= 60).length;
      fastReplyRatioPct = Number(((fastCount / latList.length) * 100).toFixed(1));
    }

    participants.push({
      sender,
      messageCount: pData.messageCount,
      charCount: pData.charCount,
      icebreakerCount: ibCount,
      icebreakerRatioPct,
      medianReplySeconds,
      fastReplyRatioPct
    });
  }

  // 计算连续聊天天数与最长断联天数
  const sortedDays = Array.from(distinctDays).sort();
  let longestStreakDays = sortedDays.length > 0 ? 1 : 0;
  let curStreak = 1;
  let longestGapDays = 0;

  for (let i = 1; i < sortedDays.length; i++) {
    const tPrev = Date.parse(sortedDays[i - 1]);
    const tCur = Date.parse(sortedDays[i]);
    const diffDays = Math.round((tCur - tPrev) / (24 * 3600 * 1000));

    if (diffDays === 1) {
      curStreak++;
      if (curStreak > longestStreakDays) longestStreakDays = curStreak;
    } else {
      curStreak = 1;
      const gap = diffDays - 1;
      if (gap > longestGapDays) longestGapDays = gap;
    }
  }

  // 月度年轮环按月升序
  const monthlyRings = [];
  const sortedMonthKeys = Array.from(monthlyRingsMap.keys()).sort();
  for (const mKey of sortedMonthKeys) {
    const m = monthlyRingsMap.get(mKey);
    monthlyRings.push({
      monthKey: mKey,
      totalCount: m.totalCount,
      charCount: m.charCount,
      bySender: m.bySender
    });
  }

  // Top 词频
  const topWords = Array.from(wordFreqMap.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    totalMessages,
    totalChars,
    participants,
    heatmap7x24,
    lateNightRatioPct,
    peakHour,
    monthlyRings,
    longestStreakDays,
    longestGapDays,
    topWords
  };
}

module.exports = {
  parseChatExport,
  analyzeChatDynamics
};
