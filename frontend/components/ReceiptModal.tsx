'use client';

import type { Receipt } from '../lib/types';

export default function ReceiptModal({
  receipt,
  onClose,
}: {
  receipt: Receipt;
  onClose: () => void;
}) {
  function printReceipt() {
    window.print();
  }

  const date = new Date(receipt.timestamp).toLocaleString();

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        id="receipt"
        className="bg-white p-6 rounded-xl w-full max-w-md space-y-4 print:shadow-none print:rounded-none"
      >
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold">Receipt</h2>
          <p className="text-sm text-gray-600">#{receipt.id}</p>
          <p className="text-sm text-gray-600">{date}</p>
          {receipt.username && (
            <p className="text-sm text-gray-600">{receipt.username}</p>
          )}
        </div>

        <ul className="space-y-2 text-sm border-t border-b py-3">
          {receipt.items.map((item, idx) => (
            <li key={idx} className="flex justify-between gap-4">
              <span>
                {item.name} × {item.quantity}
              </span>
              <span>€{item.line_total.toFixed(2)}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Payment</span>
            <span className="capitalize">{receipt.payment_method.toLowerCase()}</span>
          </div>
          <div className="flex justify-between font-semibold text-base pt-1">
            <span>Total</span>
            <span>€{receipt.total_amount.toFixed(2)}</span>
          </div>
          {receipt.amount_tendered != null && (
            <div className="flex justify-between text-gray-600">
              <span>Tendered</span>
              <span>€{receipt.amount_tendered.toFixed(2)}</span>
            </div>
          )}
          {receipt.change_due != null && receipt.change_due > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Change due</span>
              <span>€{receipt.change_due.toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2 print:hidden">
          <button
            onClick={printReceipt}
            className="flex-1 border py-2 rounded-md"
          >
            Print
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-black text-white py-2 rounded-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
