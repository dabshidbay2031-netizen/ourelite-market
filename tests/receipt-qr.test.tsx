/**
 * Receipt QR — every receipt carries a scannable code that opens the
 * LIVE order page (#/orders/:id), for both the store owner and the buyer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const toDataURL = vi.fn().mockResolvedValue('data:image/png;base64,QR-STUB');
vi.mock('qrcode', () => ({ default: { toDataURL: (...a: unknown[]) => toDataURL(...a) } }));

import Receipt from '@/components/Receipt';

const baseProps = {
  orderId: 'ORD-ABC-123',
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

describe('Receipt QR code', () => {
  it('encodes the live order URL (#/orders/:id)', async () => {
    render(<Receipt {...baseProps} />);
    await screen.findByAltText('QR code for order ORD-ABC-123');

    expect(toDataURL).toHaveBeenCalledTimes(1);
    const encodedUrl = toDataURL.mock.calls[0][0] as string;
    expect(encodedUrl).toContain('/#/orders/ORD-ABC-123');
    expect(encodedUrl.startsWith('http')).toBe(true);
  });

  it('renders the QR image with the scan hint', async () => {
    render(<Receipt {...baseProps} />);
    const img = await screen.findByAltText('QR code for order ORD-ABC-123');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,QR-STUB');
    expect(screen.getByText('Scan to view this order')).toBeInTheDocument();
  });

  it('receipt still renders if QR generation fails', async () => {
    toDataURL.mockRejectedValueOnce(new Error('no canvas'));
    render(<Receipt {...baseProps} />);
    expect(screen.getByText('🧾 Receipt')).toBeInTheDocument();
    expect(screen.getByText('Solar Lamp')).toBeInTheDocument();
    expect(screen.queryByAltText(/QR code/)).not.toBeInTheDocument();
  });
});

describe('Receipt business logo', () => {
  it('renders the uploaded logo as an image when businessIcon is a URL', async () => {
    render(<Receipt {...baseProps} businessName="Golden Crust" businessIcon="https://cdn.example.com/logo.png" />);
    const logo = await screen.findByAltText('Golden Crust logo');
    expect(logo.tagName).toBe('IMG');
    expect(logo).toHaveAttribute('src', 'https://cdn.example.com/logo.png');
  });

  it('renders an emoji icon as text (no image)', () => {
    render(<Receipt {...baseProps} businessName="Golden Crust" businessIcon="🥐" />);
    expect(screen.getByText('🥐')).toBeInTheDocument();
    expect(screen.queryByAltText('Golden Crust logo')).not.toBeInTheDocument();
  });
});
