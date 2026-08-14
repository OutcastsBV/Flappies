import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChargeModal from '../../components/ChargeModal';
import type { EnabledPaymentMethod } from '../../lib/types';

const METHODS: EnabledPaymentMethod[] = [
  { method_key: 'CASH', label: 'Cash' },
  { method_key: 'STRIPE', label: 'Stripe' },
];

describe('ChargeModal', () => {
  it('shows a message when no payment methods are enabled', () => {
    render(
      <ChargeModal total={10} methods={[]} onClose={() => {}} onConfirm={vi.fn()} />
    );

    expect(screen.getByText(/No payment methods are enabled/)).toBeInTheDocument();
  });

  it('defaults to the first method and computes change due for cash', () => {
    render(
      <ChargeModal total={7.5} methods={METHODS} onClose={() => {}} onConfirm={vi.fn()} />
    );

    const amountInput = screen.getByRole('spinbutton');
    expect(amountInput).toBeInTheDocument();

    fireEvent.change(amountInput, { target: { value: '10' } });

    expect(screen.getByText(/Change due/)).toBeInTheDocument();
    expect(screen.getByText('€2.50')).toBeInTheDocument();
  });

  it('rejects cash payment when amount tendered is less than the total', async () => {
    const onConfirm = vi.fn();
    render(
      <ChargeModal total={10} methods={METHODS} onClose={() => {}} onConfirm={onConfirm} />
    );

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Confirm payment'));

    expect(
      await screen.findByText('Amount tendered must be at least the total due')
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms a valid cash payment with the tendered amount', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ChargeModal total={10} methods={METHODS} onClose={() => {}} onConfirm={onConfirm} />
    );

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '20' } });
    fireEvent.click(screen.getByText('Confirm payment'));

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith('CASH', {
        amountTendered: 20,
        paymentReference: undefined,
      })
    );
  });

  it('switches to a reference note field for non-cash methods', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ChargeModal total={10} methods={METHODS} onClose={() => {}} onConfirm={onConfirm} />
    );

    fireEvent.click(screen.getByText('Stripe'));

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    const referenceInput = screen.getByPlaceholderText(/last 4 digits/);
    fireEvent.change(referenceInput, { target: { value: 'ch_123' } });

    fireEvent.click(screen.getByText('Confirm payment'));

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith('STRIPE', {
        amountTendered: undefined,
        paymentReference: 'ch_123',
      })
    );
  });

  it('shows an error message when onConfirm rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Register is not open'));
    render(
      <ChargeModal total={10} methods={METHODS} onClose={() => {}} onConfirm={onConfirm} />
    );

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } });
    fireEvent.click(screen.getByText('Confirm payment'));

    expect(await screen.findByText('Register is not open')).toBeInTheDocument();
  });
});
