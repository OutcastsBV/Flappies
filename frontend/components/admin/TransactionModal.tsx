import { Transaction } from '../../lib/types';

export default function TransactionModal({
  transaction,
  onClose,
}: {
  transaction: Transaction;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">
          Transaction #{transaction.id}
        </h2>

        <p className="text-sm text-gray-600">
          {new Date(transaction.timestamp).toLocaleString()}
          {transaction.username && ` — ${transaction.username}`}
        </p>

        {transaction.items.length === 0 ? (
          <p className="text-gray-600">No items</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {transaction.items.map((item, idx) => (
              <li
                key={`${item.product_id}-${idx}`}
                className="flex justify-between"
              >
                <span>
                  {item.name ?? `Product #${item.product_id}`} × {item.quantity}
                </span>
                <span>
                  €{(item.unit_price * item.quantity).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="pt-3 border-t flex justify-between font-semibold">
          <span>Total</span>
          <span>€{transaction.total_amount.toFixed(2)}</span>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-black text-white py-2 rounded-md"
        >
          Close
        </button>
      </div>
    </div>
  );
}
