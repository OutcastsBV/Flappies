'use client';

import { useState } from 'react';
import Modal from '../Modal';
import { submitSupportRequest } from '../../lib/api';
import type { SupportCategory } from '../../lib/types';

const CATEGORIES: { value: SupportCategory; label: string }[] = [
  { value: 'BUG', label: 'Bug report' },
  { value: 'FEATURE', label: 'Feature request' },
  { value: 'OTHER', label: 'Other' },
];

export default function SupportModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<SupportCategory>('BUG');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit() {
    setError('');

    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }
    if (!message.trim()) {
      setError('Message is required');
      return;
    }

    setSending(true);
    try {
      await submitSupportRequest({
        subject: subject.trim(),
        message: message.trim(),
        category,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send support request');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <Modal title="Support & feature requests" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-green-700">
            Thanks! Your message has been sent to our support team.
          </p>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="bg-black text-white px-4 py-2 rounded-md"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Support & feature requests" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Category</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`px-3 py-2 rounded border text-sm ${
                  category === c.value
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Subject</label>
          <input
            type="text"
            maxLength={200}
            className="border p-2 w-full rounded"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Message</label>
          <textarea
            className="border p-2 w-full rounded"
            rows={5}
            maxLength={5000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="text-gray-700" disabled={sending}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={sending}
            className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
