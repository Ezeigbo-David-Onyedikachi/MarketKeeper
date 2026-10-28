export interface Sale {
  id: string;
  type: 'cash' | 'debt';
  item: string;
  amount: number;
  customer: string;
  createdAt: string;
  dateKey: string;
  archived: boolean;
  paid: boolean;
  voiceDataUrl?: string | null;
  transcript?: string;
}

export interface HistoryDay {
  date: string;
  time: string;
  total: number;
  sales: Sale[];
}

export interface CustomerOwingGroup {
  name: string;
  sales: Sale[];
  total: number;
}
