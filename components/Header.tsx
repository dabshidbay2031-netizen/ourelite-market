'use client';

import Link from 'next/link';
import { useApp } from '@/context/AppContext';

interface HeaderProps {
  searchQuery?: string;
  onSearch?: (q: string) => void;
  showSearch?: boolean;
}

export default function Header({ searchQuery = '', onSearch, showSearch = true }: HeaderProps) {
  const { unreadCount, cartCount, setCartOpen } = useApp();
  const notifs = unreadCount();
  const cartItems = cartCount();

  return (
    <header className="header">
      <Link href="/" className="header-logo">
        <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="28" height="28" rx="8" fill="currentColor" opacity=".15"/>
          <path d="M7 10h14M7 14h14M7 18h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        Mogarenta
      </Link>

      {showSearch && (
        <div className="header-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search products…"
            value={searchQuery}
            onChange={e => onSearch?.(e.target.value)}
          />
        </div>
      )}

      <div className="header-actions">
        <button className="icon-btn" onClick={() => setCartOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          {cartItems > 0 && <span className="badge">{cartItems}</span>}
        </button>

        <Link href="/notifications" className="icon-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {notifs > 0 && <span className="badge">{notifs}</span>}
        </Link>
      </div>
    </header>
  );
}
