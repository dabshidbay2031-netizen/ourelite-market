/**
 * v3.7 reviews UI on the product page:
 *  - only the latest 2 reviews render; "Show more" reveals +3 per tap
 *  - the "You reviewed this product" badge appears right after submitting
 *    and hides itself (~4s) — it never lingers on revisit
 *  - the review POST carries the credited store (storefront slug store,
 *    falling back to the product's catalog owner)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/* ── module mocks ─────────────────────────────────────────────── */
let routeParams: Record<string, string> = { id: '1' };
const routerStub = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock('@/lib/hashRouter', () => ({
  useParams: () => routeParams,
  useRouter: () => routerStub,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

const product = {
  id: 1, name: 'Solar Lamp', price: 10, originalPrice: 10, category: 'electronics',
  stock: 5, sku: 'SL-1', supplierId: 42, rating: 4, reviews: 7, sold: 3, description: 'Bright.',
};
const storefrontStore = { id: 27, name: 'City Care Pharmacy', slug: 'city-care-pharmacy', icon: '💊' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let authStub: any;
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({
    state: { products: [product], suppliers: [storefrontStore], loading: false, wishlist: [], inventory: [{ id: 1, stock: 5 }], cart: [] },
    addToCart: vi.fn(), toggleWishlist: vi.fn(),
    getStock: () => 5,
    reloadProducts: async () => {},
  }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => authStub }));
vi.mock('@/lib/useClaimProduct', () => ({
  useClaimProduct: () => ({ canClaim: false, claim: vi.fn(), isMine: () => false, claimingId: null }),
}));
vi.mock('@/lib/clientAuth', () => ({ authHeaders: async (extra: Record<string, string> = {}) => extra }));

import ProductDetailPage from '@/views/ProductDetailView';

/* 7 reviews, newest first (as the API returns them) */
const sevenReviews = Array.from({ length: 7 }, (_, i) => ({
  id: i + 1, userId: `other-${i + 1}`, rating: 5, comment: `review #${i + 1}`,
  userName: `User ${i + 1}`, userAvatar: '👤', createdAt: '2026-07-10T10:00:00Z',
}));

const fetchMock = vi.fn();
beforeEach(() => {
  routeParams = { id: '1' };
  authStub = { user: { id: 'me', displayName: 'Tester', email: 't@x.com' }, currentSupplier: null };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const sent = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({
        id: 99, userId: 'me', rating: sent.rating, comment: sent.comment,
        userName: 'Tester', userAvatar: '👤', createdAt: new Date().toISOString(),
      }) };
    }
    return { ok: true, json: async () => sevenReviews };
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('reviews list — latest 2, then +3 per tap', () => {
  it('shows only the 2 latest reviews initially', async () => {
    render(<ProductDetailPage />);
    await screen.findByText('review #1');
    expect(screen.getByText('review #2')).toBeInTheDocument();
    expect(screen.queryByText('review #3')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show more \(\+3 of 5\)/ })).toBeInTheDocument();
  });

  it('each "Show more" tap reveals 3 more, then the button disappears', async () => {
    render(<ProductDetailPage />);
    await screen.findByText('review #1');

    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    expect(screen.getByText('review #5')).toBeInTheDocument();
    expect(screen.queryByText('review #6')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show more \(\+2 of 2\)/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    expect(screen.getByText('review #7')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument();
  });
});

describe('reviewed badge — flashes after submit, never lingers', () => {
  it('is NOT shown just because my old review exists', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => [{ id: 1, userId: 'me', rating: 4, comment: 'mine', userName: 'Tester', userAvatar: '👤', createdAt: '2026-07-10T10:00:00Z' }],
    }));
    render(<ProductDetailPage />);
    await screen.findByText('mine');
    expect(screen.queryByText(/You reviewed this product/)).not.toBeInTheDocument();
    // and the write box is gone too (already reviewed)
    expect(screen.queryByText('Write a Review')).not.toBeInTheDocument();
  });

  it('appears right after submitting, then hides itself', async () => {
    render(<ProductDetailPage />);
    await screen.findByText('review #1');

    // rate 5 stars and submit
    const stars = document.querySelectorAll('.review-star-btn');
    fireEvent.click(stars[4]);
    fireEvent.click(screen.getByRole('button', { name: 'Submit Review' }));

    await screen.findByText(/You reviewed this product/);
    await waitFor(
      () => expect(screen.queryByText(/You reviewed this product/)).not.toBeInTheDocument(),
      { timeout: 6000 },
    );
  }, 10000);
});

describe('review attribution sent to the API', () => {
  async function submitAndGetPostBody() {
    render(<ProductDetailPage />);
    await screen.findByText('review #1');
    fireEvent.click(document.querySelectorAll('.review-star-btn')[3]);
    fireEvent.click(screen.getByRole('button', { name: 'Submit Review' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit)?.method === 'POST')).toBe(true));
    const post = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'POST')!;
    return JSON.parse(String((post[1] as RequestInit).body));
  }

  it('plain /product/:id page credits the catalog owner', async () => {
    routeParams = { id: '1' };
    const body = await submitAndGetPostBody();
    expect(body.supplierId).toBe(42);
  });

  it('storefront /:slug/:productId page credits THAT store', async () => {
    routeParams = { slug: 'city-care-pharmacy', productId: '1' };
    const body = await submitAndGetPostBody();
    expect(body.supplierId).toBe(27);
  });
});
