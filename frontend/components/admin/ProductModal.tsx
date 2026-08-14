'use client';

import { useState } from 'react';
import { createProduct, updateProduct } from '../../lib/api';
import type { AdminProduct } from '../../lib/types';

export default function ProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: AdminProduct | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product?.price ?? 0);
  const [costPrice, setCostPrice] = useState(product?.cost_price ?? 0);
  const [stock, setStock] = useState(product?.current_stock ?? 0);
  const [reorder, setReorder] = useState(product?.reorder_level ?? 0);

  async function submit() {
    if (product) {
      await updateProduct(product.product_id, {
        name,
        price: Number(price),
        cost_price: Number(costPrice),
        current_stock: Number(stock),
        reorder_level: Number(reorder),
      });
    } else {
      await createProduct({
        name,
        description,
        price: Number(price),
        cost_price: Number(costPrice),
        current_stock: Number(stock),
        reorder_level: Number(reorder),
      });
    }

    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
        <div className="bg-white p-6 rounded-xl w-96 space-y-5">
            <h2 className="text-lg font-semibold">
            {product ? 'Edit product' : 'Add product'}
            </h2>

            {/* Name */}
            <div>
            <label className="block text-sm font-medium mb-1">
                Name
            </label>
            <input
                className="border p-2 w-full rounded"
                value={name}
                onChange={(e) => setName(e.target.value)}
            />
            </div>

            {/* Description */}
            <div>
            <label className="block text-sm font-medium mb-1">
                Description
            </label>
            <textarea
                className="border p-2 w-full rounded"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
            />
            </div>

            {/* Price */}
            <div>
            <label className="block text-sm font-medium mb-1">
                Sale price (€)
            </label>
            <input
                type="number"
                step="0.01"
                className="border p-2 w-full rounded"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
            />
            </div>

            {/* Cost price */}
            <div>
            <label className="block text-sm font-medium mb-1">
                Cost price (€) — for P&amp;L reports
            </label>
            <input
                type="number"
                step="0.01"
                className="border p-2 w-full rounded"
                value={costPrice}
                onChange={(e) => setCostPrice(Number(e.target.value))}
            />
            </div>

            {/* Current stock */}
            <div>
            <label className="block text-sm font-medium mb-1">
                Current stock
            </label>
            <input
                type="number"
                className="border p-2 w-full rounded"
                value={stock}
                onChange={(e) => setStock(Number(e.target.value))}
            />
            </div>

            {/* Reorder level */}
            <div>
            <label className="block text-sm font-medium mb-1">
                Reorder level
            </label>
            <input
                type="number"
                className="border p-2 w-full rounded"
                value={reorder}
                onChange={(e) => setReorder(Number(e.target.value))}
            />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3">
            <button
                onClick={onClose}
                className="text-gray-700"
            >
                Cancel
            </button>
            <button
                onClick={submit}
                className="bg-black text-white px-4 py-2 rounded"
            >
                Save
            </button>
            </div>
        </div>
    </div>
  );
}
