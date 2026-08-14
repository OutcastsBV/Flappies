import { API_BASE_URL } from './config';
import { logoutLocal } from './auth';
import type {
  AuditLogEntry,
  CheckoutResult,
  CorrectionType,
  Correction,
  CurrentRegister,
  EnabledPaymentMethod,
  PaymentMethodConfig,
  PnLReport,
  Receipt,
  RegisterSession,
  Role,
  SalesByDay,
  SalesByPaymentMethod,
  SalesByProduct,
  SalesSummary,
  ShopConfig,
  ShopInfo,
  SupportCategory,
  Transaction,
} from './types';

export type User = {
  id: number;
  username: string;
  email?: string;
  role?: Role;
  groups?: string[];
};

export type UserDetails = {
  id: number;
  username: string;
  role: Role;
  email: string;
  is_active: boolean;
};

export type CartItem = {
  item_id: number;
  name: string;
  price: number;
  amount: number;
};

export type Cart = CartItem[];

export type Product = {
  product_id: number;
  current_stock: number;
  name: string;
  price: number;
};

export async function apiFetch(url: string, options: RequestInit = {}) {
  const headers: HeadersInit = {
    ...(options.headers || {}),
  };

  if (options.body && !(options.headers as Record<string, string>)?.['Content-Type']) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    console.error('API error', res.status, url);
  }

  return res;
}

async function handleUnauthorized() {
  await logoutLocal();
  throw new Error('Unauthorized');
}

async function handleResponse(res: Response) {
  if (res.status === 401) {
    await handleUnauthorized();
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'API error');
  }

  return res.json();
}

async function handleResponseWithError(res: Response, fallback: string) {
  if (!res.ok) {
    if (res.status === 401) {
      await handleUnauthorized();
    }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || fallback);
  }

  return res.json();
}

export async function getMe(): Promise<User> {
  const res = await apiFetch(`${API_BASE_URL}/me`);
  return handleResponse(res);
}

export async function getMyDetails(): Promise<UserDetails> {
  const res = await apiFetch(`${API_BASE_URL}/users/me`);
  return handleResponse(res);
}

export async function getCart() {
  const res = await apiFetch(`${API_BASE_URL}/cart`);
  return handleResponse(res);
}

export async function createCartWithItem(itemId: number, amount: number) {
  const res = await apiFetch(`${API_BASE_URL}/cart`, {
    method: 'POST',
    body: JSON.stringify({ item_id: itemId, amount }),
  });
  return handleResponse(res);
}

export async function updateCartItem(itemId: number, amount: number) {
  const res = await apiFetch(`${API_BASE_URL}/cart/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify({ amount }),
  });
  return handleResponse(res);
}

export async function deleteCartItem(itemId: number) {
  const res = await apiFetch(`${API_BASE_URL}/cart/${itemId}`, {
    method: 'DELETE',
  });
  return handleResponse(res);
}

export async function clearCart() {
  const res = await apiFetch(`${API_BASE_URL}/cart`, {
    method: 'DELETE',
  });
  return handleResponse(res);
}

export async function getInventory(): Promise<Product[]> {
  const res = await apiFetch(`${API_BASE_URL}/inventory`);
  return handleResponse(res);
}

export async function checkout(
  paymentMethod: string,
  details: { amountTendered?: number; paymentReference?: string } = {}
): Promise<CheckoutResult> {
  const res = await apiFetch(`${API_BASE_URL}/cart/checkout`, {
    method: 'POST',
    body: JSON.stringify({
      payment_method: paymentMethod,
      amount_tendered: details.amountTendered,
      payment_reference: details.paymentReference,
    }),
  });

  return handleResponseWithError(res, 'Checkout failed');
}

export async function getMyTransactions(): Promise<Transaction[]> {
  const res = await apiFetch(`${API_BASE_URL}/transactions/mine`);
  return handleResponse(res);
}

export async function getReceipt(transactionId: number): Promise<Receipt> {
  const res = await apiFetch(
    `${API_BASE_URL}/transactions/${transactionId}/receipt`
  );
  return handleResponse(res);
}

export async function getProducts() {
  const res = await apiFetch(`${API_BASE_URL}/inventory/admin`);
  return handleResponse(res);
}

export async function getUsers() {
  const res = await apiFetch(`${API_BASE_URL}/users/`);
  return handleResponse(res);
}

export async function createUser(user: {
  username: string;
  email: string;
  password: string;
  given_name?: string;
  family_name?: string;
  role?: Role;
  is_active?: boolean;
}) {
  const res = await apiFetch(`${API_BASE_URL}/users/`, {
    method: 'POST',
    body: JSON.stringify(user),
  });

  return handleResponseWithError(res, 'Failed to create user');
}

export async function updateUser(
  userId: number,
  user: {
    username?: string;
    email?: string;
    role?: Role;
    is_active?: boolean;
  }
) {
  const res = await apiFetch(`${API_BASE_URL}/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(user),
  });
  return handleResponseWithError(res, 'Failed to save user');
}

export async function createProduct(product: {
  name: string;
  description: string;
  price: number;
  cost_price?: number;
  current_stock?: number;
  reorder_level?: number;
}) {
  const productRes = await apiFetch(`${API_BASE_URL}/products`, {
    method: 'POST',
    body: JSON.stringify({
      name: product.name,
      description: product.description,
      price: product.price,
      cost_price: product.cost_price ?? 0,
    }),
  });

  const createdProduct = await handleResponse(productRes);

  const inventoryRes = await apiFetch(`${API_BASE_URL}/inventory`, {
    method: 'POST',
    body: JSON.stringify({
      product_id: createdProduct.id,
      current_stock: product.current_stock ?? 0,
      reorder_level: product.reorder_level ?? 0,
    }),
  });

  await handleResponse(inventoryRes);
  return createdProduct;
}

export async function updateProduct(
  productId: number,
  product: {
    name: string;
    price: number;
    description?: string;
    cost_price?: number;
    current_stock?: number;
    reorder_level?: number;
  }
) {
  const productRes = await apiFetch(`${API_BASE_URL}/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: product.name,
      description: product.description,
      price: product.price,
      cost_price: product.cost_price,
    }),
  });

  const updatedProduct = await handleResponse(productRes);

  const inventoryPayload: Record<string, number> = {};

  if (typeof product.current_stock === 'number') {
    inventoryPayload.current_stock = product.current_stock;
  }

  if (typeof product.reorder_level === 'number') {
    inventoryPayload.reorder_level = product.reorder_level;
  }

  if (Object.keys(inventoryPayload).length > 0) {
    const inventoryRes = await apiFetch(
      `${API_BASE_URL}/inventory/${productId}`,
      {
        method: 'PUT',
        body: JSON.stringify(inventoryPayload),
      }
    );
    await handleResponse(inventoryRes);
  }

  return updatedProduct;
}

export async function deleteProduct(productId: number) {
  await apiFetch(`${API_BASE_URL}/inventory/${productId}`, {
    method: 'DELETE',
  }).then(handleResponse);

  await apiFetch(`${API_BASE_URL}/products/${productId}`, {
    method: 'DELETE',
  }).then(handleResponse);

  return true;
}

export async function getTransactions(filters?: {
  happy_hour?: boolean;
}): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (filters?.happy_hour != null) {
    params.set('happy_hour', String(filters.happy_hour));
  }
  const q = params.toString();
  const res = await apiFetch(`${API_BASE_URL}/transactions${q ? `?${q}` : ''}`);
  return handleResponse(res);
}

export async function getTransaction(
  transactionId: number
): Promise<Transaction> {
  const res = await apiFetch(`${API_BASE_URL}/transactions/${transactionId}`);
  return handleResponse(res);
}

export async function getConfig(): Promise<ShopConfig> {
  const res = await apiFetch(`${API_BASE_URL}/config`);
  return handleResponse(res);
}

export async function getShopInfo(): Promise<ShopInfo> {
  const res = await apiFetch(`${API_BASE_URL}/config/shop`);
  return handleResponse(res);
}

export async function updateConfig(config: {
  happy_hour_days?: number[];
  happy_hour_start_time?: string | null;
  happy_hour_end_time?: string | null;
}) {
  const res = await apiFetch(`${API_BASE_URL}/config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
  return handleResponse(res);
}

// Payment methods (modular Cash / Stripe / SumUp config)

export async function getEnabledPaymentMethods(): Promise<
  EnabledPaymentMethod[]
> {
  const res = await apiFetch(`${API_BASE_URL}/payment-methods`);
  return handleResponse(res);
}

export async function getPaymentMethodsAdmin(): Promise<
  PaymentMethodConfig[]
> {
  const res = await apiFetch(`${API_BASE_URL}/payment-methods/admin`);
  return handleResponse(res);
}

export async function updatePaymentMethod(
  methodKey: string,
  update: { enabled?: boolean; config?: Record<string, string | null> }
): Promise<PaymentMethodConfig> {
  const res = await apiFetch(`${API_BASE_URL}/payment-methods/${methodKey}`, {
    method: 'PUT',
    body: JSON.stringify(update),
  });
  return handleResponseWithError(res, 'Failed to update payment method');
}

// Register (till) sessions

export async function getCurrentRegister(): Promise<CurrentRegister> {
  const res = await apiFetch(`${API_BASE_URL}/register/current`);
  return handleResponse(res);
}

export async function openRegister(
  startingAmount: number
): Promise<RegisterSession> {
  const res = await apiFetch(`${API_BASE_URL}/register/open`, {
    method: 'POST',
    body: JSON.stringify({ starting_amount: startingAmount }),
  });
  return handleResponseWithError(res, 'Failed to open register');
}

export async function closeRegister(
  countedCashAmount: number,
  notes?: string
) {
  const res = await apiFetch(`${API_BASE_URL}/register/close`, {
    method: 'POST',
    body: JSON.stringify({ counted_cash_amount: countedCashAmount, notes }),
  });
  return handleResponseWithError(res, 'Failed to close register');
}

export async function getRegisterSessions(): Promise<RegisterSession[]> {
  const res = await apiFetch(`${API_BASE_URL}/register/sessions`);
  return handleResponse(res);
}

// Corrections (refunds / bad prices / bad items)

export async function createCorrection(correction: {
  transaction_id: number;
  type: CorrectionType;
  amount: number;
  reason: string;
}): Promise<Correction> {
  const res = await apiFetch(`${API_BASE_URL}/corrections`, {
    method: 'POST',
    body: JSON.stringify(correction),
  });
  return handleResponseWithError(res, 'Failed to create correction');
}

export async function getCorrections(): Promise<Correction[]> {
  const res = await apiFetch(`${API_BASE_URL}/corrections`);
  return handleResponse(res);
}

function reportQuery(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const q = params.toString();
  return q ? `?${q}` : '';
}

export async function getSalesSummary(
  from?: string,
  to?: string
): Promise<SalesSummary> {
  const res = await apiFetch(
    `${API_BASE_URL}/reports/sales${reportQuery(from, to)}`
  );
  return handleResponse(res);
}

export async function getSalesByProduct(
  from?: string,
  to?: string
): Promise<SalesByProduct[]> {
  const res = await apiFetch(
    `${API_BASE_URL}/reports/sales/by-product${reportQuery(from, to)}`
  );
  return handleResponse(res);
}

export async function getSalesByDay(
  from?: string,
  to?: string
): Promise<SalesByDay[]> {
  const res = await apiFetch(
    `${API_BASE_URL}/reports/sales/by-day${reportQuery(from, to)}`
  );
  return handleResponse(res);
}

export async function getPnLReport(
  from?: string,
  to?: string
): Promise<PnLReport> {
  const res = await apiFetch(
    `${API_BASE_URL}/reports/pnl${reportQuery(from, to)}`
  );
  return handleResponse(res);
}

export async function getSalesByPaymentMethod(
  from?: string,
  to?: string
): Promise<SalesByPaymentMethod[]> {
  const res = await apiFetch(
    `${API_BASE_URL}/reports/sales/by-payment-method${reportQuery(from, to)}`
  );
  return handleResponse(res);
}

// Support / feature requests (admin & manager)

export async function submitSupportRequest(request: {
  subject: string;
  message: string;
  category: SupportCategory;
}) {
  const res = await apiFetch(`${API_BASE_URL}/support`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return handleResponseWithError(res, 'Failed to send support request');
}

// Audit log (read-only, admin & manager)

export async function getAuditLog(filters?: {
  action?: string;
  entity_type?: string;
  from?: string;
  to?: string;
}): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams();
  if (filters?.action) params.set('action', filters.action);
  if (filters?.entity_type) params.set('entity_type', filters.entity_type);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const q = params.toString();
  const res = await apiFetch(`${API_BASE_URL}/audit${q ? `?${q}` : ''}`);
  return handleResponse(res);
}
