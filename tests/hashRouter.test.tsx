/**
 * Hash router — URL parsing, route matching, navigation, and the
 * next/navigation-compatible hook surface.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  parseHash, matchPath, Link, RouterView,
  HashRouterProvider, usePathname, useSearchParams, useParams, useRouter,
} from '@/lib/hashRouter';

/* ── parseHash ───────────────────────────────────────────────── */

describe('parseHash', () => {
  it('empty hash → root path', () => {
    expect(parseHash('')).toEqual({ path: '/', query: '' });
  });

  it('"#/" → root path', () => {
    expect(parseHash('#/')).toEqual({ path: '/', query: '' });
  });

  it('plain route', () => {
    expect(parseHash('#/dashboard')).toEqual({ path: '/dashboard', query: '' });
  });

  it('route with params and query string', () => {
    expect(parseHash('#/product/3?from=search&x=1'))
      .toEqual({ path: '/product/3', query: 'from=search&x=1' });
  });

  it('ignores non-route hashes (Supabase OAuth tokens)', () => {
    expect(parseHash('#access_token=abc&token_type=bearer'))
      .toEqual({ path: '/', query: '' });
  });

  it('ignores plain anchors', () => {
    expect(parseHash('#section-2')).toEqual({ path: '/', query: '' });
  });
});

/* ── matchPath ───────────────────────────────────────────────── */

describe('matchPath', () => {
  it('exact static match → empty params', () => {
    expect(matchPath('/dashboard', '/dashboard')).toEqual({});
  });

  it('root matches root', () => {
    expect(matchPath('/', '/')).toEqual({});
  });

  it('extracts :id param', () => {
    expect(matchPath('/product/:id', '/product/42')).toEqual({ id: '42' });
  });

  it('decodes URI components in params', () => {
    expect(matchPath('/:slug', '/my%20store')).toEqual({ slug: 'my store' });
  });

  it('rejects different segment counts', () => {
    expect(matchPath('/product/:id', '/product')).toBeNull();
    expect(matchPath('/product/:id', '/product/1/reviews')).toBeNull();
  });

  it('rejects non-matching static segments', () => {
    expect(matchPath('/orders/:id', '/product/1')).toBeNull();
  });

  it('"/suppliers" does not match "/supplier/:id" pattern and vice versa', () => {
    expect(matchPath('/supplier/:id', '/suppliers')).toBeNull();
    expect(matchPath('/suppliers', '/supplier/3')).toBeNull();
  });
});

/* ── Link ────────────────────────────────────────────────────── */

describe('Link', () => {
  it('renders app links as hash hrefs', () => {
    render(<Link href="/checkout">Checkout</Link>);
    expect(screen.getByText('Checkout')).toHaveAttribute('href', '#/checkout');
  });

  it('leaves external links untouched', () => {
    render(<Link href="https://example.com">Ext</Link>);
    expect(screen.getByText('Ext')).toHaveAttribute('href', 'https://example.com');
  });

  it('leaves tel: links untouched', () => {
    render(<Link href="tel:+25261234">Call</Link>);
    expect(screen.getByText('Call')).toHaveAttribute('href', 'tel:+25261234');
  });

  it('passes through className', () => {
    render(<Link href="/" className="nav-item">Home</Link>);
    expect(screen.getByText('Home')).toHaveClass('nav-item');
  });
});

/* ── RouterView + hooks ──────────────────────────────────────── */

function PathProbe() {
  return <div data-testid="path">{usePathname()}</div>;
}
function ParamsProbe() {
  const { id } = useParams<{ id: string }>();
  return <div data-testid="param-id">{id}</div>;
}
function QueryProbe() {
  return <div data-testid="q">{useSearchParams().get('q') ?? '(none)'}</div>;
}
const Home     = () => <div>HOME-VIEW</div>;
const Fallback = () => <div>FALLBACK-VIEW</div>;

function setHash(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

const ROUTES = [
  { pattern: '/',            component: Home },
  { pattern: '/product/:id', component: ParamsProbe },
  { pattern: '/search',      component: QueryProbe },
  { pattern: '/:slug',       component: () => <div>SLUG-VIEW</div> },
];

function App() {
  return (
    <HashRouterProvider>
      <PathProbe />
      <RouterView routes={ROUTES} fallback={Fallback} />
    </HashRouterProvider>
  );
}

describe('RouterView', () => {
  it('renders the root route by default', () => {
    render(<App />);
    expect(screen.getByText('HOME-VIEW')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/');
  });

  it('navigates on hashchange and provides params', () => {
    render(<App />);
    setHash('#/product/7');
    expect(screen.getByTestId('param-id')).toHaveTextContent('7');
    expect(screen.getByTestId('path')).toHaveTextContent('/product/7');
  });

  it('exposes the hash query through useSearchParams', () => {
    render(<App />);
    setHash('#/search?q=milk');
    expect(screen.getByTestId('q')).toHaveTextContent('milk');
  });

  it('single unknown segment falls through to the /:slug route', () => {
    render(<App />);
    setHash('#/techvault');
    expect(screen.getByText('SLUG-VIEW')).toBeInTheDocument();
  });

  it('multi-segment unknown path renders the fallback', () => {
    render(<App />);
    setHash('#/no/such/page');
    expect(screen.getByText('FALLBACK-VIEW')).toBeInTheDocument();
  });

  it('route order wins: static routes beat /:slug', () => {
    render(<App />);
    setHash('#/search');
    expect(screen.getByTestId('q')).toHaveTextContent('(none)');
    expect(screen.queryByText('SLUG-VIEW')).not.toBeInTheDocument();
  });
});

describe('useRouter', () => {
  it('push() updates the location hash', () => {
    function Pusher() {
      const router = useRouter();
      return <button onClick={() => router.push('/orders')}>go</button>;
    }
    render(<HashRouterProvider><Pusher /></HashRouterProvider>);
    act(() => { screen.getByText('go').click(); });
    expect(window.location.hash).toBe('#/orders');
  });
});
