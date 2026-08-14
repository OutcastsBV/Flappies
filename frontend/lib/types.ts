export type AdminProduct = {
  product_id: number;
  name: string;
  description: string;
  price: number;
  cost_price?: number;
  current_stock: number;
  reorder_level: number;
};

export type TransactionItem = {
  product_id: number;
  quantity: number;
  unit_price: number;
  name?: string;
};

export type Transaction = {
  id: number;
  total_amount: number;
  timestamp: string;
  user_id?: number;
  username?: string;
  payment_method?: string;
  items: TransactionItem[];
};

export type Receipt = {
  id: number;
  timestamp: string;
  total_amount: number;
  payment_method: string;
  username?: string;
  items: {
    name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[];
};

export type User = {
  id: number;
  card_id: number;
  keycloak_id: string;
  username: string;
  balance: number;
  created_at: string;
  email: string;
  is_active: boolean;
};

export type ShopConfig = {
  happy_hour_days: number[];
  happy_hour_start_time: string | null;
  happy_hour_end_time: string | null;
  operation_mode?: 'self_service' | 'pos';
  top_up_enabled?: boolean;
  top_up_methods?: TopUpMethod[];
  top_up_epc_enabled?: boolean;
  top_up_stripe_enabled?: boolean;
  top_up_epc_configured?: boolean;
  top_up_stripe_configured?: boolean;
  payment_methods?: string[];
};

export type TopUpMethod = 'epc_qr' | 'stripe';

export type ShopInfo = {
  operation_mode: 'self_service' | 'pos';
  payment_methods: string[];
  top_up_enabled: boolean;
  top_up_methods: TopUpMethod[];
  happy_hour_active: boolean;
};

export type EpcTopUpResult = {
  request_id: number;
  reference: string;
  amount: number;
  epc_payload: string;
  beneficiary_name: string;
  iban: string;
  message: string;
};

export type StripeTopUpResult = {
  request_id: number;
  reference: string;
  checkout_url: string;
};

export type SalesSummary = {
  transaction_count: number;
  total_revenue: number;
  wallet_revenue: number;
  card_revenue: number;
};

export type SalesByProduct = {
  product_id: number;
  name: string;
  units_sold: number;
  revenue: number;
};

export type SalesByDay = {
  day: string;
  transaction_count: number;
  revenue: number;
};

export type PnLReport = {
  products: {
    product_id: number;
    name: string;
    units_sold: number;
    revenue: number;
    cost: number;
    profit: number;
  }[];
  totals: {
    revenue: number;
    cost: number;
    profit: number;
  };
};

export type CheckoutResult = {
  message: string;
  transaction_id: number;
  total: number;
  payment_method: string;
  timestamp: string;
  items: {
    product_id: number;
    name: string;
    quantity: number;
    unit_price: number;
  }[];
};
