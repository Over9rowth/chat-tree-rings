export interface ChatMessage {
  timestampMs: number;
  isoTime: string;
  sender: string;
  content: string;
}

export interface ParticipantStat {
  sender: string;
  messageCount: number;
  charCount: number;
  icebreakerCount: number;
  icebreakerRatioPct: number;
  medianReplySeconds: number;
  fastReplyRatioPct: number;
}

export interface MonthlyRingItem {
  monthKey: string;
  totalCount: number;
  bySender: Record<string, number>;
  charCount: number;
}

export interface WordCountItem {
  word: string;
  count: number;
}

export interface ChatDynamicsReport {
  totalMessages: number;
  totalChars: number;
  participants: ParticipantStat[];
  heatmap7x24: number[][];
  lateNightRatioPct: number;
  peakHour: number;
  monthlyRings: MonthlyRingItem[];
  longestStreakDays: number;
  longestGapDays: number;
  topWords: WordCountItem[];
}

export declare function parseChatExport(rawText: string, formatHint?: "auto" | "txt" | "csv" | "json"): ChatMessage[];
export declare function analyzeChatDynamics(messages: ChatMessage[]): ChatDynamicsReport;
