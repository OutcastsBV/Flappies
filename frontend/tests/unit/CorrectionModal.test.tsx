import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CorrectionModal from '../../components/CorrectionModal';
import { createCorrection } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  createCorrection: vi.fn(),
}));

describe('CorrectionModal', () => {
  beforeEach(() => {
    vi.mocked(createCorrection).mockReset();
  });

  it('defaults to the Refund type and shows the transaction total', () => {
    render(
      <CorrectionModal
        transactionId={42}
        maxAmount={12.5}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );

    expect(screen.getByText('Refund')).toHaveClass('bg-black');
    expect(screen.getByText('Transaction total: €12.50')).toBeInTheDocument();
  });

  it('validates the amount before submitting', async () => {
    render(
      <CorrectionModal transactionId={42} onClose={() => {}} onSaved={() => {}} />
    );

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Bad price' } });
    fireEvent.click(screen.getByText('Save correction'));

    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument();
    expect(createCorrection).not.toHaveBeenCalled();
  });

  it('requires a reason before submitting', async () => {
    render(
      <CorrectionModal transactionId={42} onClose={() => {}} onSaved={() => {}} />
    );

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Save correction'));

    expect(await screen.findByText('A reason is required')).toBeInTheDocument();
    expect(createCorrection).not.toHaveBeenCalled();
  });

  it('submits a valid correction with the selected type', async () => {
    vi.mocked(createCorrection).mockResolvedValue({} as never);
    const onSaved = vi.fn();

    render(
      <CorrectionModal transactionId={42} onClose={() => {}} onSaved={onSaved} />
    );

    fireEvent.click(screen.getByText('Bad price'));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2.50' } });
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Charged the wrong price' },
    });
    fireEvent.click(screen.getByText('Save correction'));

    await waitFor(() =>
      expect(createCorrection).toHaveBeenCalledWith({
        transaction_id: 42,
        type: 'PRICE_ADJUSTMENT',
        amount: 2.5,
        reason: 'Charged the wrong price',
      })
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('shows an error message when the API call fails', async () => {
    vi.mocked(createCorrection).mockRejectedValue(new Error('Transaction not found'));

    render(
      <CorrectionModal transactionId={999} onClose={() => {}} onSaved={() => {}} />
    );

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'oops' } });
    fireEvent.click(screen.getByText('Save correction'));

    expect(await screen.findByText('Transaction not found')).toBeInTheDocument();
  });
});
