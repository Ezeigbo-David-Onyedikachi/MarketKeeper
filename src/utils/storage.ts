import { Sale, HistoryDay } from '../types';

export const STORAGE_KEY = 'shop-ledger-sales-v1';
export const HISTORY_KEY = 'mk_history';

export const todayKey = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

export function loadSales(): Sale[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter((sale: Sale) => sale && sale.id && sale.amount) : [];
  } catch {
    return [];
  }
}

export function loadHistory(): HistoryDay[] {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter((day: HistoryDay) => day && day.date && Array.isArray(day.sales)) : [];
  } catch {
    return [];
  }
}

export function persistHistory(history: HistoryDay[]): boolean {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch {
    return false;
  }
}

export function persistSales(sales: Sale[]): { success: boolean; sales: Sale[]; toast?: string } {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
    return { success: true, sales };
  } catch {
    try {
      const trimmed = sales.map((sale) => ({ ...sale, voiceDataUrl: null }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return {
        success: true,
        sales: trimmed,
        toast: 'Sale saved. The phone could not keep the voice recording.',
      };
    } catch {
      return {
        success: false,
        sales,
        toast: 'Sale is visible, but phone storage is full.',
      };
    }
  }
}

export function formatNaira(value: number | string): string {
  return `₦${Math.round(Number(value) || 0).toLocaleString('en-NG')}`;
}

export function formatTime(timestamp: string): string {
  try {
    return new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

export function formatDate(): string {
  try {
    return new Intl.DateTimeFormat('en-NG', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  } catch {
    return 'Today';
  }
}

export function playSavedSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.onended = () => {
      context.close().catch(() => {});
    };
  } catch {
    // Sound is a nice-to-have
  }
}

export function normalizeTranscript(transcript: string): string {
  return transcript.replace(/[₦]/g, ' ').replace(/\bnaira\b/gi, ' ').replace(/\s+/g, ' ').trim();
}

export interface ParsedVoiceSale {
  amount: number;
  item: string;
  customer: string;
  type: 'cash' | 'debt';
}

export function parseVoiceSale(transcript: string): ParsedVoiceSale | null {
  const normalized = normalizeTranscript(transcript);
  const amountMatch = normalized.match(/\d[\d,]*(?:\.\d+)?/);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[0].replace(/,/g, ''));
  if (!amount) return null;
  const matchIndex = amountMatch.index ?? 0;
  const isDebt = /\b(debt|credit|owe|owing)\b/i.test(normalized);
  let before = normalized.slice(0, matchIndex).trim();
  let after = normalized.slice(matchIndex + amountMatch[0].length).trim();
  before = before.replace(/^(sold|sell|sale|add|record)\s+/i, '').replace(/\s+(for|to)$/i, '').trim();
  after = after.replace(/\b(debt|credit|owe|owing|cash|sale)\b/gi, '').replace(/\s+/g, ' ').trim();
  let item = before;
  let customer = '';
  if (isDebt) {
    customer = after.replace(/^to\s+/i, '').trim();
    item = item.replace(/\s+to$/i, '').trim();
  }
  return { amount, item, customer, type: isDebt ? 'debt' : 'cash' };
}

export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}
