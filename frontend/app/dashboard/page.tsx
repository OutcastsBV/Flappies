'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReceiptModal from '../../components/ReceiptModal';
import TopUpButton from '../../components/TopUpButton';
import TopUpModal from '../../components/TopUpModal';
import type { User, Cart, Product, UserDetails } from '../../lib/api';
import type { Receipt, ShopInfo, Transaction } from '../../lib/types';
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
} from '../../lib/api';
import { isAdmin, logout } from '../../lib/auth';
import { motion } from 'framer-motion';
import Modal from '../../components/Modal';

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
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [topUpNotice, setTopUpNotice] = useState('');

  const [user, setUser] = useState<User | null>(null);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [cart, setCart] = useState<Cart>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [myTransactions, setMyTransactions] = useState<Transaction[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  async function refreshUserData() {
    setUser(await getMe());
    setUserDetails(await getMyDetails());
  }

  useEffect(() => {
    async function init() {
      try {
        const me = await getMe();
        setUser(me);

        const meDetailed = await getMyDetails();
        setUserDetails(meDetailed);

        const [cartData, inventory, info, history] = await Promise.all([
          getCart(),
          getInventory(),
          getShopInfo(),
          getMyTransactions(),
        ]);

        setCart(cartData);
        setProducts(inventory);
        setShopInfo(info);
        setMyTransactions(history);
      } catch {
        router.push('/login');
      } finally {
        setInventoryLoading(false);
        setLoading(false);
      }
    }

    init();
  }, [router]);

  useEffect(() => {
    const topupStatus = searchParams.get('topup');
    if (!topupStatus) return;

    if (topupStatus === 'success') {
      setTopUpNotice('Payment received. Your balance will update shortly.');
      refreshUserData().catch(() => undefined);
    } else if (topupStatus === 'cancelled') {
      setTopUpNotice('Card payment was cancelled.');
    }

    router.replace('/dashboard');
  }, [searchParams, router]);

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

  async function handleOrder() {
    setOrderError('');
    try {
      const result = await checkout('WALLET');
      const receiptData = await getReceipt(result.transaction_id);

      setCart([]);
      setProducts(await getInventory());
      setMyTransactions(await getMyTransactions());

      await refreshUserData();

      setShowOrder(false);
      setReceipt(receiptData);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Order failed');
    }
  }

  async function viewReceipt(id: number) {
    const data = await getReceipt(id);
    setReceipt(data);
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
  const insufficientBalance = total > (userDetails?.balance ?? 0);
  const topUpEnabled = shopInfo?.top_up_enabled ?? false;
  const topUpMethods = shopInfo?.top_up_methods ?? [];

  function OrderModal({
    onClose,
    onConfirm,
  }: {
    onClose: () => void;
    onConfirm: () => void;
  }) {
    return (
      <Modal title="Confirm order" onClose={onClose}>
        {orderError && (
          <p className="text-sm text-red-600 mb-3">{orderError}</p>
        )}
        <p className="text-sm text-gray-600 mb-4">
          Total: €{total.toFixed(2)} — paid from your wallet balance.
        </p>
        <button
          onClick={onConfirm}
          className="w-full bg-black text-white py-2 rounded-md"
        >
          Place order
        </button>
      </Modal>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8 text-gray-900">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-semibold">Self-service shop</h1>
            {shopInfo?.happy_hour_active && (
              <p className="text-sm text-green-700 font-medium mt-1">
                Happy hour — all prices 50% off!
              </p>
            )}
          </div>
          <button onClick={logout} className="text-gray-700 hover:text-black">
            Logout
          </button>
        </div>

        {topUpNotice && (
          <p className="bg-blue-50 text-blue-800 border border-blue-100 rounded-lg px-4 py-3 text-sm">
            {topUpNotice}
          </p>
        )}

        <div className="bg-white p-6 rounded-xl shadow flex justify-between items-center">
          <div>
            <p className="text-lg font-semibold">{user.username}</p>
            <p className="text-gray-700">
              Balance: €{userDetails.balance.toFixed(2)}
            </p>
          </div>

          <div className="flex gap-3">
            <TopUpButton
              enabled={topUpEnabled}
              onClick={() => setShowTopUp(true)}
              className="bg-black text-white px-4 py-2 rounded-md"
            >
              Top Up
            </TopUpButton>

            <button
              onClick={() => setShowHistory(true)}
              className="border px-4 py-2 rounded-md"
            >
              My purchases
            </button>

            {isAdmin(user) && (
              <button
                onClick={() => router.push('/admin')}
                className="bg-black text-white px-4 py-2 rounded-md"
              >
                Admin
              </button>
            )}
          </div>
        </div>

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
                    <motion.div
                      key={product.product_id}
                      whileTap={{ scale: 0.97 }}
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
                          disabled={product.current_stock === 0}
                          onClick={() => addToCart(product)}
                          className={`px-3 py-1 rounded-md ${
                            product.current_stock === 0
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
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white p-4 rounded-xl shadow flex flex-col">
            <h2 className="text-lg font-semibold mb-4">Cart</h2>

            {cart.length === 0 ? (
              <p className="text-gray-700">Your cart is empty</p>
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

                  {insufficientBalance ? (
                    <TopUpButton
                      enabled={topUpEnabled}
                      onClick={() => setShowTopUp(true)}
                      className="w-full bg-yellow-500 text-black py-2 rounded-md"
                    >
                      Top up balance
                    </TopUpButton>
                  ) : (
                    <button
                      onClick={() => setShowOrder(true)}
                      className="w-full bg-black text-white py-2 rounded-md"
                    >
                      Order
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {showTopUp && (
          <TopUpModal
            methods={topUpMethods}
            onClose={() => setShowTopUp(false)}
          />
        )}

        {showOrder && (
          <OrderModal
            onClose={() => setShowOrder(false)}
            onConfirm={handleOrder}
          />
        )}

        {receipt && (
          <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
        )}

        {showHistory && (
          <Modal title="My purchases" onClose={() => setShowHistory(false)}>
            {myTransactions.length === 0 ? (
              <p className="text-gray-600">No purchases yet.</p>
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {myTransactions.map((t) => (
                  <li
                    key={t.id}
                    className="flex justify-between items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                    onClick={() => viewReceipt(t.id)}
                  >
                    <span>
                      #{t.id} —{' '}
                      {new Date(t.timestamp).toLocaleDateString()}
                    </span>
                    <span className="font-medium">
                      €{t.total_amount.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Modal>
        )}
      </div>
    </main>
  );
}
