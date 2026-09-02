'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReceiptModal from '../../components/ReceiptModal';
import ChargeModal from '../../components/ChargeModal';
import CorrectionModal from '../../components/CorrectionModal';
import Modal from '../../components/Modal';
import HappyHourBadge from '../../components/HappyHourBadge';
import type { User, Cart, Product, UserDetails } from '../../lib/api';
import type {
  CurrentRegister,
  EnabledPaymentMethod,
  Receipt,
  RegisterSummary,
  ShopInfo,
  Transaction,
} from '../../lib/types';
import {
  createCartWithItem,
  getCart,
  updateCartItem,
  deleteCartItem,
  getInventory,
  getMyDetails,
  getMe,
  checkout,
  getReceipt,
  getMyTransactions,
  getShopInfo,
  getCurrentRegister,
  openRegister,
  closeRegister,
  getEnabledPaymentMethods,
} from '../../lib/api';
import { isManagerOrAdmin, logout } from '../../lib/auth';
import BrandLogo from '../../components/BrandLogo';

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <p className="text-gray-900">Loading dashboard…</p>
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [showCharge, setShowCharge] = useState(false);
  const [showOpenRegister, setShowOpenRegister] = useState(false);
  const [showCloseRegister, setShowCloseRegister] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  const [user, setUser] = useState<User | null>(null);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [cart, setCart] = useState<Cart>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [register, setRegister] = useState<CurrentRegister>(null);
  const [paymentMethods, setPaymentMethods] = useState<EnabledPaymentMethod[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [myTransactions, setMyTransactions] = useState<Transaction[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<Transaction | null>(null);

  async function refreshRegister() {
    setRegister(await getCurrentRegister());
  }

  useEffect(() => {
    async function init() {
      try {
        const me = await getMe();
        setUser(me);

        const meDetailed = await getMyDetails();
        setUserDetails(meDetailed);

        const [cartData, inventory, info, history, currentRegister, methods] =
          await Promise.all([
            getCart(),
            getInventory(),
            getShopInfo(),
            getMyTransactions(),
            getCurrentRegister(),
            getEnabledPaymentMethods(),
          ]);

        setCart(cartData);
        setProducts(inventory);
        setShopInfo(info);
        setMyTransactions(history);
        setRegister(currentRegister);
        setPaymentMethods(methods);
      } catch {
        router.push('/login');
      } finally {
        setInventoryLoading(false);
        setLoading(false);
      }
    }

    init();
  }, [router]);

  function getQuantity(productId: number) {
    const item = cart.find((i) => i.item_id === productId);
    return item?.amount ?? 0;
  }

  async function addToCart(product: Product) {
    const existing = cart.find((item) => item.item_id === product.product_id);

    if (!existing) {
      await createCartWithItem(product.product_id, 1);
    } else {
      await updateCartItem(product.product_id, existing.amount + 1);
    }

    setCart(await getCart());
  }

  async function changeQuantity(product: Product, delta: number) {
    const item = cart.find((i) => i.item_id === product.product_id);

    if (!item) {
      if (delta > 0) {
        await createCartWithItem(product.product_id, 1);
      } else {
        return;
      }
    } else {
      const newAmount = item.amount + delta;

      if (newAmount <= 0) {
        await deleteCartItem(product.product_id);
      } else {
        await updateCartItem(product.product_id, newAmount);
      }
    }

    setCart(await getCart());
  }

  async function handleCharge(
    method: string,
    details: { amountTendered?: number; paymentReference?: string }
  ) {
    const result = await checkout(method, details);
    setShowCharge(false);
    setCart([]);

    const [receiptData, inventory, transactions] = await Promise.all([
      getReceipt(result.transaction_id),
      getInventory(),
      getMyTransactions(),
    ]);
    setProducts(inventory);
    setMyTransactions(transactions);
    await refreshRegister();
    setReceipt(receiptData);
  }

  async function viewReceipt(id: number) {
    const data = await getReceipt(id);
    setReceipt(data);
  }

  async function handleOpenRegister(startingAmount: number) {
    setCheckoutError('');
    try {
      await openRegister(startingAmount);
      await refreshRegister();
      setShowOpenRegister(false);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Failed to open register');
    }
  }

  async function handleCloseRegister(countedCashAmount: number, notes: string) {
    setCheckoutError('');
    try {
      await closeRegister(countedCashAmount, notes);
      await refreshRegister();
      setShowCloseRegister(false);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Failed to close register');
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-900">Loading dashboard…</p>
      </main>
    );
  }

  if (!user || !userDetails) return null;

  const total = cart.reduce((sum, i) => sum + i.price * i.amount, 0);
  const registerOpen = register !== null;

  return (
    <main className="min-h-screen bg-gray-100 p-8 text-gray-900">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <BrandLogo size={48} />
            <div>
              <h1 className="text-3xl font-semibold">Register</h1>
              {shopInfo?.happy_hour_active && (
                <p className="text-sm text-green-700 font-medium mt-1">
                  Happy hour — all prices 50% off!
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-3 items-center">
            {isManagerOrAdmin(user) && (
              <button
                type="button"
                onClick={() => router.push('/admin')}
                className="bg-black text-white px-4 py-2 rounded-md"
              >
                Admin panel
              </button>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              className="text-gray-700 hover:text-black"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow flex justify-between items-center flex-wrap gap-4">
          <div>
            <p className="text-lg font-semibold">{user.username}</p>
            <p className="text-gray-700 capitalize">{userDetails.role}</p>
          </div>

          {registerOpen ? (
            <div className="flex items-center gap-6 flex-wrap">
              <div className="text-sm">
                <p className="text-gray-600">Starting float</p>
                <p className="font-medium">
                  €{register!.summary.starting_amount.toFixed(2)}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-gray-600">Cash sales</p>
                <p className="font-medium">
                  €{register!.summary.cash_sales.toFixed(2)}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-gray-600">Card / QR sales</p>
                <p className="font-medium">
                  €{register!.summary.other_sales.toFixed(2)}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-gray-600">Expected cash</p>
                <p className="font-medium">
                  €{register!.summary.expected_cash.toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setShowHistory(true)}
                className="border px-4 py-2 rounded-md"
              >
                Recent sales
              </button>
              <button
                onClick={() => setShowCloseRegister(true)}
                className="border border-red-300 text-red-700 px-4 py-2 rounded-md"
              >
                Close register
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowOpenRegister(true)}
              className="bg-black text-white px-4 py-2 rounded-md"
            >
              Open register
            </button>
          )}
        </div>

        {!registerOpen && (
          <p className="bg-yellow-50 text-yellow-800 border border-yellow-100 rounded-lg px-4 py-3 text-sm">
            Open the register with a starting cash amount before taking payments.
          </p>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Products</h2>

            {inventoryLoading ? (
              <p className="text-gray-700">Loading products…</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {products.map((product) => {
                  const quantity = getQuantity(product.product_id);

                  return (
                    <div
                      key={product.product_id}
                      className="bg-white p-4 rounded-lg shadow flex justify-between items-center"
                    >
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-gray-700">
                          €{product.price.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">
                          Stock: {product.current_stock}
                        </p>
                      </div>

                      {quantity === 0 ? (
                        <button
                          disabled={product.current_stock === 0 || !registerOpen}
                          onClick={() => addToCart(product)}
                          className={`px-3 py-1 rounded-md ${
                            product.current_stock === 0 || !registerOpen
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-black text-white'
                          }`}
                        >
                          {product.current_stock === 0 ? 'Out' : 'Add'}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => changeQuantity(product, -1)}
                            className="px-2 py-1 border rounded"
                          >
                            −
                          </button>
                          <span className="min-w-[24px] text-center font-medium">
                            {quantity}
                          </span>
                          <button
                            onClick={() => changeQuantity(product, +1)}
                            disabled={quantity >= product.current_stock}
                            className={`px-2 py-1 border rounded ${
                              quantity >= product.current_stock
                                ? 'opacity-40 cursor-not-allowed'
                                : ''
                            }`}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white p-4 rounded-xl shadow flex flex-col">
            <h2 className="text-lg font-semibold mb-4">Cart</h2>

            {cart.length === 0 ? (
              <p className="text-gray-700">Cart is empty</p>
            ) : (
              <>
                <ul className="flex-1 space-y-2">
                  {cart.map((item) => (
                    <li key={item.item_id} className="flex justify-between">
                      <span>
                        {item.name} × {item.amount}
                      </span>
                      <span>€{(item.price * item.amount).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>

                <div className="border-t mt-4 pt-4 space-y-3">
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span>€{total.toFixed(2)}</span>
                  </div>

                  <button
                    onClick={() => setShowCharge(true)}
                    disabled={!registerOpen}
                    className="w-full bg-black text-white py-2 rounded-md disabled:opacity-50"
                  >
                    Charge
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {showCharge && (
          <ChargeModal
            total={total}
            methods={paymentMethods}
            onClose={() => setShowCharge(false)}
            onConfirm={handleCharge}
          />
        )}

        {receipt && (
          <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
        )}

        {showOpenRegister && (
          <OpenRegisterModal
            error={checkoutError}
            onClose={() => setShowOpenRegister(false)}
            onConfirm={handleOpenRegister}
          />
        )}

        {showCloseRegister && register && (
          <CloseRegisterModal
            summary={register.summary}
            error={checkoutError}
            onClose={() => setShowCloseRegister(false)}
            onConfirm={handleCloseRegister}
          />
        )}

        {showHistory && (
          <Modal title="Recent sales" onClose={() => setShowHistory(false)}>
            {myTransactions.length === 0 ? (
              <p className="text-gray-600">No sales yet.</p>
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {myTransactions.map((t) => (
                  <li
                    key={t.id}
                    className="flex justify-between items-center p-2 hover:bg-gray-50 rounded"
                  >
                    <span
                      className="cursor-pointer flex items-center gap-2"
                      onClick={() => viewReceipt(t.id)}
                    >
                      #{t.id} —{' '}
                      {new Date(t.timestamp).toLocaleDateString()}
                      {t.payment_method && (
                        <span className="text-xs text-gray-500 capitalize">
                          {t.payment_method.toLowerCase()}
                        </span>
                      )}
                      <HappyHourBadge active={t.happy_hour_active} />
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-medium">
                        €{t.total_amount.toFixed(2)}
                      </span>
                      <button
                        onClick={() => setCorrectionTarget(t)}
                        className="text-xs text-blue-600"
                      >
                        Correct
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Modal>
        )}

        {correctionTarget && (
          <CorrectionModal
            transactionId={correctionTarget.id}
            maxAmount={correctionTarget.total_amount}
            onClose={() => setCorrectionTarget(null)}
            onSaved={() => {
              setCorrectionTarget(null);
              refreshRegister();
            }}
          />
        )}
      </div>
    </main>
  );
}

function OpenRegisterModal({
  error,
  onClose,
  onConfirm,
}: {
  error: string;
  onClose: () => void;
  onConfirm: (startingAmount: number) => void;
}) {
  const [startingAmount, setStartingAmount] = useState('');

  return (
    <Modal title="Open register" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Starting cash amount (€)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="border p-2 w-full rounded"
            value={startingAmount}
            onChange={(e) => setStartingAmount(e.target.value)}
            autoFocus
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={() => onConfirm(Number(startingAmount))}
          className="w-full bg-black text-white py-2 rounded-md"
        >
          Open register
        </button>
      </div>
    </Modal>
  );
}

function CloseRegisterModal({
  summary,
  error,
  onClose,
  onConfirm,
}: {
  summary: RegisterSummary;
  error: string;
  onClose: () => void;
  onConfirm: (countedCashAmount: number, notes: string) => void;
}) {
  const [countedCashAmount, setCountedCashAmount] = useState('');
  const [notes, setNotes] = useState('');
  const parsed = Number(countedCashAmount);
  const variance = Number.isFinite(parsed) ? parsed - summary.expected_cash : null;

  return (
    <Modal title="Close register" onClose={onClose}>
      <div className="space-y-4">
        <div className="text-sm space-y-1 bg-gray-50 rounded p-3">
          <div className="flex justify-between">
            <span>Starting float</span>
            <span>€{summary.starting_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Cash sales</span>
            <span>€{summary.cash_sales.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Card / QR sales</span>
            <span>€{summary.other_sales.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Expected cash in drawer</span>
            <span>€{summary.expected_cash.toFixed(2)}</span>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Expected cash is the notes in the till (starting float + cash sales).
          Card and QR payments do not go in the drawer.
        </p>

        <div>
          <label className="block text-sm font-medium mb-1">
            Counted cash amount (€)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="border p-2 w-full rounded"
            value={countedCashAmount}
            onChange={(e) => setCountedCashAmount(e.target.value)}
            autoFocus
          />
          {countedCashAmount && variance !== null && (
            <p
              className={`text-sm mt-1 ${
                variance === 0 ? 'text-gray-600' : 'text-red-600'
              }`}
            >
              Variance: €{variance.toFixed(2)}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notes (optional)</label>
          <textarea
            className="border p-2 w-full rounded"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={() => onConfirm(Number(countedCashAmount), notes)}
          className="w-full bg-black text-white py-2 rounded-md"
        >
          Close register
        </button>
      </div>
    </Modal>
  );
}
