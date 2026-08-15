export interface Location {
  id: string;
  name: string;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
}

export interface Product {
  id: string;
  name: string;
  category_id: string;
  unit: 'un' | 'kg' | 'L' | 'cx';
  allows_half: boolean;
  low_stock_threshold: number;
  active: boolean;
}

export interface LocationProduct {
  location_id: string;
  product_id: string;
  active: boolean;
}

export interface DailyCount {
  id: string;
  location_id: string;
  date: string;
  counted_by: string;
  prefill_missing: boolean;
  submitted_at: string;
  count_lines?: CountLine[];
}

export interface CountLine {
  daily_count_id: string;
  product_id: string;
  quantity: number;
}

export interface Restock {
  id: string;
  location_id: string;
  product_id: string;
  date: string;
  quantity: number;
  note: string | null;
}

export interface Profile {
  user_id: string;
  role: 'admin' | 'owner' | 'store_manager' | 'staff';
  location_id: string | null;
}

export interface SaleDaily {
  id: string;
  location_id: string;
  date: string;
  amount: number;
  note: string | null;
}
