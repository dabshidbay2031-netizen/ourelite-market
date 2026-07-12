/**
 * v3.7 receipt reprint & POS auto-print:
 *  - a reprinted receipt shows the ORDER's date, not "now"
 *  - paymentMethod 'invoice' prints as "Invoice (pay later)"
 *  - autoPrint (Settings → POS) opens the print window once the QR is ready
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const toDataURL = vi.fn().mockResolvedValue('data:image/png;base64,QR-STUB');
vi.mock('qrcode', () => ({ default: { toDataURL: (...a: unknown[]) => toDataURL(...a) } }));

import Receipt from '@/components/Receipt';

const baseProps = {
  orderId: 'ORD-REPRINT-1',
  customerName: 'Ayan',
  paymentMethod: 'cash',
  items: [{ id: 1, qty: 2 }],
  products: [{
    id: 1, name: 'Solar Lamp', price: 9.99, originalPrice: 9.99, category: 'electronics',
    icon: '💡', stock: 5, sku: 'SL', rating: 5, reviews: 0, sold: 0, description: '',
  }] as never,
  subtotal: 19.98,
  discount: 0,
  total: 19.98,
  onClose: () => {},
};

beforeEach(() => toDataURL.mockClear());
afterEach(() => vi.restoreAllMocks());

describe('reprint date', () => {
  it('shows the order date when `date` is passed (reprint)', () => {
    render(<Receipt {...baseProps} date="2026-03-05T14:30:00Z" />);
    expect(screen.getByText(/Mar 5, 2026/)).toBeInTheDocument();
  });

  it('falls back to today for a fresh sale', () => {
    render(<Receipt {...baseProps} />);
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    expect(screen.getByText(new RegExp(today.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
  });
});

describe('payment labels', () => {
  it("'invoice' prints as a pay-later sale", () => {
    render(<Receipt {...baseProps} paymentMethod="invoice" />);
    expect(screen.getByText('Invoice (pay later)')).toBeInTheDocument();
  });

  it("'sifalo' keeps its label", () => {
    render(<Receipt {...baseProps} paymentMethod="sifalo" />);
    expect(screen.getByText('Sifalo Pay')).toBeInTheDocument();
  });
});

describe('auto-print (Settings → POS)', () => {
  it('opens the print window automatically once the QR is ready', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<Receipt {...baseProps} autoPrint />);
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it('never auto-prints without the setting', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<Receipt {...baseProps} />);
    await screen.findByAltText('QR code for order ORD-REPRINT-1');
    await new Promise(r => setTimeout(r, 600));   // longer than the auto-print delay
    expect(openSpy).not.toHaveBeenCalled();
  });
});
