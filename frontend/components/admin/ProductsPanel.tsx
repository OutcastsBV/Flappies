'use client';

import { useEffect, useState } from 'react';
import { getProducts } from '../../lib/api';
import ProductModal from './ProductModal';
import type { AdminProduct } from '../../lib/types';

export default function ProductsPanel() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [showModal, setShowModal] = useState(false);

  async function reloadProducts() {
    setProducts(await getProducts());
  }

  useEffect(() => {
    let cancelled = false;

    getProducts().then((data) => {
      if (!cancelled) {
        setProducts(data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-semibold">Products</h1>
        <button
          onClick={() => {
            setEditing(null);
            setShowModal(true);
          }}
          className="bg-black text-white px-4 py-2 rounded"
        >
          Add product
        </button>
      </div>

      <table className="w-full bg-white rounded shadow text-sm">
        <thead>
          <tr className="border-b">
            <th className="p-3 text-left">Name</th>
            <th className="p-3 text-left">Price</th>
            <th className="p-3 text-left">Stock</th>
            <th className="p-3 text-left">Reorder</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.product_id} className="border-b">
              <td className="p-3">{p.name}</td>
              <td className="p-3">€{p.price.toFixed(2)}</td>
              <td className="p-3">{p.current_stock}</td>
              <td className="p-3">{p.reorder_level}</td>
              <td className="p-3 flex gap-3">
                <button
                  onClick={() => {
                    setEditing(p);
                    setShowModal(true);
                  }}
                  className="text-blue-600"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <ProductModal
          product={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            reloadProducts();
          }}
        />
      )}
    </>
  );
}
