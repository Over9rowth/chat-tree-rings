// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { parseChatExport, analyzeChatDynamics, ChatDynamicsReport } from '../domain/chat-rings.cjs';

// 30 秒“诶”点内置双人多月跨度聊天记录样本
const SAMPLE_CHAT_TXT = `2026-01-01 00:01:20 Alice
新年快乐呀！今年也要一起加油！
2026-01-01 00:01:50 Bob
新年快乐！哈哈哈今天放假吃什么好吃的？
2026-01-01 00:02:10 Alice
想吃热气腾腾的火锅！
2026-01-01 09:30:00 Bob
早安，出发去接你！
2026-01-01 09:30:20 Alice
好的，马上收拾好！
2026-02-14 23:10:00 Alice
情人节的巧克力好好吃，今天很开心～
2026-02-14 23:10:45 Bob
你喜欢就好，早点睡，晚安！
2026-02-15 00:05:00 Alice
晚安晚安！
2026-03-08 12:00:00 Bob
今天妇女节，祝大美女节日快乐！
2026-03-08 12:01:10 Alice
哈哈哈谢谢！晚上去逛街吗？
2026-04-05 14:20:00 Alice
清明假期这边的春花开得好漂亮！
2026-04-05 14:20:30 Bob
拍的照片绝了，简直壁纸级别！
2026-05-20 23:50:00 Bob
520 快乐！不知不觉又聊了这么久。
2026-05-20 23:50:40 Alice
哈哈哈是啊，时间过得好快！
2026-06-01 10:00:00 Alice
儿童节快乐！今天有没有礼物呀？
2026-06-01 10:00:25 Bob
当然有，快递马上就送到！
2026-07-07 23:15:00 Bob
七夕节快乐！下楼看夜空，今晚星星特别亮。
2026-07-07 23:15:40 Alice
哇真的好亮！哈哈哈太浪漫了。
2026-08-15 22:30:00 Alice
中秋月圆，记得吃月饼～
2026-08-15 22:30:50 Bob
在吃蛋黄莲蓉呢，给你留了半盒！`;

declare global {
  interface Window {
    chatrings?: {
      exportReportJson: (json: string) => Promise<{ path: string; bytes: number } | null>;
      exportManualPdf: () => Promise<{ path: string; bytes: number } | null>;
      smokeReady: (p: { mounted: boolean; engineOk: boolean }) => void;
      onSmokeRun: (cb: () => void) => void;
      smokeResult: (payload: unknown) => Promise<void>;
    };
  }
}

export function App() {
  const [chatText, setChatText] = useState(SAMPLE_CHAT_TXT);
  const [report, setReport] = useState<ChatDynamicsReport | null>(null);

  const runAnalysis = (txt: string) => {
    const msgs = parseChatExport(txt);
    const r = analyzeChatDynamics(msgs);
    setReport(r);
    return r;
  };

  useEffect(() => {
    const r = runAnalysis(chatText);

    if (window.chatrings) {
      window.chatrings.smokeReady({ mounted: true, engineOk: !!r });
      window.chatrings.onSmokeRun(() => {
        const fresh = runAnalysis(SAMPLE_CHAT_TXT);
        window.chatrings?.smokeResult({ report: fresh });
      });
    }
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setChatText(val);
    runAnalysis(val);
  };

  const handleExportJson = async () => {
    if (!report || !window.chatrings) return;
    await window.chatrings.exportReportJson(JSON.stringify(report, null, 2));
  };

  const handleExportManual = async () => {
    if (!window.chatrings) return;
    await window.chatrings.exportManualPdf();
  };

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <div className="brand-dot" />
          <h1 className="title">聊天记录年轮 <span className="version">v0.1.0</span></h1>
          <span className="badge">100% 本机离线</span>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => { setChatText(SAMPLE_CHAT_TXT); runAnalysis(SAMPLE_CHAT_TXT); }}>
            重载年度对话样本
          </button>
          <button className="btn btn-secondary" onClick={handleExportManual}>
            导出说明书 (PDF)
          </button>
          <button className="btn btn-primary" onClick={handleExportJson}>
            导出年轮报告 (JSON)
          </button>
        </div>
      </header>

      <div className="honest-banner">
        【仪器观测边界】100% 本机纯离线运行，绝无网络请求或外部遥测，所有活跃热力与破冰动力学均由遍历本地消息真实计算。
      </div>

      {report && (
        <section className="dashboard-grid">
          <div className="card">
            <div className="card-label">总消息量 / 字数</div>
            <div className="card-value">
              {report.totalMessages} <span className="unit">条</span> / {report.totalChars} <span className="unit">字</span>
            </div>
            <div className="card-sub">跨越 {report.monthlyRings.length} 个月份 / 连续 {report.longestStreakDays} 天</div>
          </div>

          <div className="card">
            <div className="card-label">深夜活跃比 (22:00-04:00)</div>
            <div className="card-value highlight-amber">
              {report.lateNightRatioPct}%
            </div>
            <div className="card-sub">峰值时段在 {report.peakHour}:00 点</div>
          </div>

          {report.participants.map((p, idx) => (
            <div key={idx} className="card">
              <div className="card-label">{p.sender} (发言 {p.messageCount} 条)</div>
              <div className="card-value highlight-cyan">
                破冰 {p.icebreakerRatioPct}%
              </div>
              <div className="card-sub">中位回复 {p.medianReplySeconds}s / 秒回率 {p.fastReplyRatioPct}%</div>
            </div>
          ))}
        </section>
      )}

      <div className="workspace-split">
        {/* 左侧：输入或导入聊天记录 */}
        <div className="panel left-panel">
          <div className="panel-header">
            <span>本地聊天文本输入 (支持 TXT / CSV / JSON)</span>
            <span className="count-hint">{report?.totalMessages ?? 0} 条消息</span>
          </div>
          <textarea
            className="text-input"
            value={chatText}
            onChange={handleTextChange}
            placeholder="粘贴导出的聊天记录文本（微信/QQ/CSV/JSON）..."
          />
        </div>

        {/* 右侧：月度年轮环与高频词 */}
        <div className="panel right-panel">
          <div className="panel-header">
            <span>月度年轮环 (Monthly Rings)</span>
            <span className="count-hint">对话生长足迹</span>
          </div>

          <div className="ring-list">
            {report?.monthlyRings.map((m, idx) => (
              <div key={idx} className="ring-item">
                <span className="ring-month">{m.monthKey}</span>
                <div className="ring-bar-bg">
                  <div
                    className="ring-bar-fill"
                    style={{ width: `${Math.min(100, (m.totalCount / (report?.totalMessages || 1)) * 300)}%` }}
                  />
                </div>
                <span className="ring-count">{m.totalCount} 条 ({m.charCount} 字)</span>
              </div>
            ))}
          </div>

          <div className="panel-header" style={{ marginTop: '12px' }}>
            <span>年度高频词 (Top Words)</span>
          </div>
          <div className="word-tags">
            {report?.topWords.map((w, idx) => (
              <span key={idx} className="word-tag">
                {w.word} ({w.count})
              </span>
            ))}
            {(!report || report.topWords.length === 0) && (
              <div className="empty-hint">暂无提取词频</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
