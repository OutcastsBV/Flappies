import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChargeModal from '../../components/ChargeModal';
import { resetSumupTerminalSession } from '../../components/SumUpTerminalPanel';
import { resetWeroQrSession } from '../../components/WeroQrPanel';
import type { EnabledPaymentMethod } from '../../lib/types';
import {
  cancelSumupCheckout,
  cancelWeroPayment,
  createSumupCheckout,
  createWeroPayment,
  getSumupCheckout,
  getWeroPayment,
  listSumupReaders,
} from '../../lib/api';

vi.mock('../../lib/api', () => ({
  createWeroPayment: vi.fn(),
  getWeroPayment: vi.fn(),
  cancelWeroPayment: vi.fn(),
  createSumupCheckout: vi.fn(),
  getSumupCheckout: vi.fn(),
  cancelSumupCheckout: vi.fn(),
  listSumupReaders: vi.fn(),
}));

const METHODS: EnabledPaymentMethod[] = [
  { method_key: 'CASH', label: 'Cash' },
  { method_key: 'STRIPE', label: 'Stripe' },
];

describe('ChargeModal', () => {
  beforeEach(() => {
    vi.mocked(createWeroPayment).mockReset();
    vi.mocked(getWeroPayment).mockReset();
    vi.mocked(cancelWeroPayment).mockReset();
    vi.mocked(createSumupCheckout).mockReset();
    vi.mocked(getSumupCheckout).mockReset();
    vi.mocked(cancelSumupCheckout).mockReset();
    vi.mocked(cancelWeroPayment).mockResolvedValue(undefined);
    vi.mocked(cancelSumupCheckout).mockResolvedValue(undefined);
    vi.mocked(listSumupReaders).mockReset();
    vi.mocked(listSumupReaders).mockResolvedValue([
      {
        id: 'rdr_3MSAFM23CK82VSTT4BN6RWSQ65',
        name: 'Register',
        status: 'paired',
      },
    ]);
    resetSumupTerminalSession();
    resetWeroQrSession();
  });
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

  it('shows a Wero QR and records the sale after Payconiq succeeds', async () => {
    vi.mocked(createWeroPayment).mockResolvedValue({
      paymentId: '5bdb1685b93d1c000bde96f2',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      qrcodeUrl: 'https://portal.ext.payconiq.com/qrcode?c=abc&s=M',
      amountCents: 1000,
      total: 10,
    });
    vi.mocked(getWeroPayment)
      .mockResolvedValueOnce({
        paymentId: '5bdb1685b93d1c000bde96f2',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        qrcodeUrl: 'https://portal.ext.payconiq.com/qrcode?c=abc&s=M',
        amountCents: 1000,
      })
      .mockResolvedValue({
        paymentId: '5bdb1685b93d1c000bde96f2',
        status: 'SUCCEEDED',
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        amountCents: 1000,
      });
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ChargeModal
        total={10}
        methods={[{ method_key: 'WERO', label: 'Wero' }]}
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );

    expect(await screen.findByAltText('Wero QR code')).toHaveAttribute(
      'src',
      'https://portal.ext.payconiq.com/qrcode?c=abc&s=M'
    );
    expect(screen.queryByText('Confirm payment')).not.toBeInTheDocument();

    await waitFor(
      () =>
        expect(onConfirm).toHaveBeenCalledWith('WERO', {
          paymentReference: '5bdb1685b93d1c000bde96f2',
        }),
      { timeout: 4000 }
    );
  });

  it('cancels a pending Wero payment when the modal is closed', async () => {
    vi.mocked(createWeroPayment).mockResolvedValue({
      paymentId: '5bdb1685b93d1c000bde96f2',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      qrcodeUrl: 'https://portal.ext.payconiq.com/qrcode?c=abc&s=M',
      amountCents: 1000,
      total: 10,
    });
    vi.mocked(getWeroPayment).mockImplementation(() => new Promise(() => {}));
    vi.mocked(cancelWeroPayment).mockResolvedValue(undefined);

    const { unmount } = render(
      <ChargeModal
        total={10}
        methods={[{ method_key: 'WERO', label: 'Wero' }]}
        onClose={() => {}}
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => expect(createWeroPayment).toHaveBeenCalled());
    unmount();
    await waitFor(() =>
      expect(cancelWeroPayment).toHaveBeenCalledWith('5bdb1685b93d1c000bde96f2')
    );
  });

  it('sends a SumUp payment to the terminal and records it after success', async () => {
    vi.mocked(createSumupCheckout).mockResolvedValue({
      readerId: 'rdr_3MSAFM23CK82VSTT4BN6RWSQ65',
      checkoutId: '00e33a36-c99b-4cb2-b635-b90c1455c9c8',
      status: 'pending',
      paymentReference:
        'rdr_3MSAFM23CK82VSTT4BN6RWSQ65:00e33a36-c99b-4cb2-b635-b90c1455c9c8',
      amountCents: 1000,
      total: 10,
    });
    vi.mocked(getSumupCheckout)
      .mockResolvedValueOnce({
        readerId: 'rdr_3MSAFM23CK82VSTT4BN6RWSQ65',
        checkoutId: '00e33a36-c99b-4cb2-b635-b90c1455c9c8',
        status: 'pending',
        paymentReference:
          'rdr_3MSAFM23CK82VSTT4BN6RWSQ65:00e33a36-c99b-4cb2-b635-b90c1455c9c8',
        amountCents: 1000,
      })
      .mockResolvedValue({
        readerId: 'rdr_3MSAFM23CK82VSTT4BN6RWSQ65',
        checkoutId: '00e33a36-c99b-4cb2-b635-b90c1455c9c8',
        status: 'successful',
        paymentReference:
          'rdr_3MSAFM23CK82VSTT4BN6RWSQ65:00e33a36-c99b-4cb2-b635-b90c1455c9c8',
        amountCents: 1000,
      });
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ChargeModal
        total={10}
        methods={[{ method_key: 'SUMUP', label: 'SumUp' }]}
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );

    expect(
      await screen.findByText(/Keep this window open until the terminal finishes/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Confirm payment')).not.toBeInTheDocument();

    await waitFor(
      () =>
        expect(onConfirm).toHaveBeenCalledWith('SUMUP', {
          paymentReference:
            'rdr_3MSAFM23CK82VSTT4BN6RWSQ65:00e33a36-c99b-4cb2-b635-b90c1455c9c8',
        }),
      { timeout: 4000 }
    );
  });

  it('reuses a single SumUp checkout when React remounts in Strict Mode', async () => {
    vi.mocked(createSumupCheckout).mockResolvedValue({
      readerId: 'rdr_3MSAFM23CK82VSTT4BN6RWSQ65',
      checkoutId: '00e33a36-c99b-4cb2-b635-b90c1455c9c8',
      status: 'pending',
      paymentReference:
        'rdr_3MSAFM23CK82VSTT4BN6RWSQ65:00e33a36-c99b-4cb2-b635-b90c1455c9c8',
      amountCents: 1000,
      total: 10,
    });
    vi.mocked(getSumupCheckout).mockImplementation(() => new Promise(() => {}));

    render(
      <StrictMode>
        <ChargeModal
          total={10}
          methods={[{ method_key: 'SUMUP', label: 'SumUp' }]}
          onClose={() => {}}
          onConfirm={vi.fn()}
        />
      </StrictMode>
    );

    await waitFor(() =>
      expect(createSumupCheckout).toHaveBeenCalledWith(
        'rdr_3MSAFM23CK82VSTT4BN6RWSQ65'
      )
    );
    expect(createSumupCheckout).toHaveBeenCalledTimes(1);
    expect(cancelSumupCheckout).not.toHaveBeenCalled();
  });

  it('lets the cashier pick among multiple paired SumUp terminals', async () => {
    vi.mocked(listSumupReaders).mockResolvedValue([
      {
        id: 'rdr_3MSAFM23CK82VSTT4BN6RWSQ65',
        name: 'Bar',
        status: 'paired',
      },
      {
        id: 'rdr_AAAAAAAAAAAAAAAAAAAAAAAAAA',
        name: 'Terrace',
        status: 'paired',
      },
    ]);
    vi.mocked(createSumupCheckout).mockResolvedValue({
      readerId: 'rdr_AAAAAAAAAAAAAAAAAAAAAAAAAA',
      checkoutId: '00e33a36-c99b-4cb2-b635-b90c1455c9c8',
      status: 'pending',
      paymentReference:
        'rdr_AAAAAAAAAAAAAAAAAAAAAAAAAA:00e33a36-c99b-4cb2-b635-b90c1455c9c8',
      amountCents: 1000,
      total: 10,
    });
    vi.mocked(getSumupCheckout).mockImplementation(() => new Promise(() => {}));

    render(
      <ChargeModal
        total={10}
        methods={[{ method_key: 'SUMUP', label: 'SumUp' }]}
        onClose={() => {}}
        onConfirm={vi.fn()}
      />
    );

    expect(await screen.findByText('Bar')).toBeInTheDocument();
    expect(screen.getByText('Terrace')).toBeInTheDocument();
    expect(createSumupCheckout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Terrace'));
    await waitFor(() =>
      expect(createSumupCheckout).toHaveBeenCalledWith(
        'rdr_AAAAAAAAAAAAAAAAAAAAAAAAAA'
      )
    );
  });
});
