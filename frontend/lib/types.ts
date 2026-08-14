export type Role = 'admin' | 'manager' | 'cashier';

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

export type CorrectionType =
  | 'REFUND'
  | 'PRICE_ADJUSTMENT'
  | 'ITEM_REMOVED'
  | 'OTHER';

export type Correction = {
  id: number;
  transaction_id: number;
  type: CorrectionType;
  amount: number;
  reason: string;
  created_by: number;
  created_by_username?: string;
  created_at: string;
};

export type Transaction = {
  id: number;
  total_amount: number;
  timestamp: string;
  user_id?: number;
  username?: string;
  payment_method?: string;
  amount_tendered?: number | null;
  payment_reference?: string | null;
  register_session_id?: number | null;
  happy_hour_active?: boolean;
  items: TransactionItem[];
  corrections?: Correction[];
  net_total?: number;
};

export type Receipt = {
  id: number;
  timestamp: string;
  total_amount: number;
  payment_method: string;
  amount_tendered?: number | null;
  change_due?: number;
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
  keycloak_id?: string;
  username: string;
  role: Role;
  created_at: string;
  email: string;
  is_active: boolean;
};

export type ShopConfig = {
  happy_hour_days: number[];
  happy_hour_start_time: string | null;
  happy_hour_end_time: string | null;
};

export type ShopInfo = {
  happy_hour_active: boolean;
};

export type PaymentMethodField = {
  key: string;
  label: string;
  secret: boolean;
  has_value: boolean;
};

export type PaymentMethodConfig = {
  method_key: string;
  label: string;
  enabled: boolean;
  updated_at?: string;
  fields: PaymentMethodField[];
};

export type EnabledPaymentMethod = {
  method_key: string;
  label: string;
};

export type RegisterSession = {
  id: number;
  opened_by: number;
  opened_by_username?: string;
  opened_at: string;
  starting_amount: number;
  closed_by?: number | null;
  closed_by_username?: string | null;
  closed_at?: string | null;
  counted_cash_amount?: number | null;
  expected_cash_amount?: number | null;
  status: 'open' | 'closed';
  notes?: string | null;
};

export type RegisterSummary = {
  starting_amount: number;
  cash_sales: number;
  other_sales: number;
  total_sales: number;
  transaction_count: number;
  cash_corrections: number;
  total_corrections: number;
  expected_cash: number;
  counted_cash?: number;
  variance?: number;
};

export type CurrentRegister = {
  session: RegisterSession;
  summary: RegisterSummary;
} | null;

export type SalesSummary = {
  transaction_count: number;
  total_revenue: number;
  cash_revenue: number;
  other_revenue: number;
  total_corrections: number;
  net_revenue: number;
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

export type SalesByPaymentMethod = {
  payment_method: string;
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

export type SupportCategory = 'BUG' | 'FEATURE' | 'OTHER';

export type AuditLogEntry = {
  id: number;
  actor_user_id: number | null;
  actor_username: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type CheckoutResult = {
  message: string;
  transaction_id: number;
  total: number;
  payment_method: string;
  change_due: number;
  timestamp: string;
  items: {
    product_id: number;
    name: string;
    quantity: number;
    unit_price: number;
  }[];
};
