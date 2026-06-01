import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider }  from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';
import { I18nProvider } from '@/context/I18nContext';
import { ViewProvider } from '@/context/ViewContext';
import BottomNav        from '@/components/BottomNav';
import Sidebar          from '@/components/Sidebar';
import CartDrawer       from '@/components/CartDrawer';
import ToastContainer   from '@/components/Toast';
import InstallPrompt    from '@/components/InstallPrompt';
import WishlistSync     from '@/components/WishlistSync';

export const metadata: Metadata = {
  title: 'Mogarenta Shop',
  description: 'E-commerce & Point of Sale',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor:   '#4F46E5',
  width:        'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://yerjmwspaxnuyhgecpom.supabase.co" />
        <link rel="dns-prefetch" href="https://yerjmwspaxnuyhgecpom.supabase.co" />
        <link rel="dns-prefetch" href="https://elite-markets-7c557.firebaseapp.com" />
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
          <script
            defer
            data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.js"
          />
        )}
      </head>
      <body>
        {/*
         * ViewProvider enables instant client-side navigation via useView().
         * All main-page navigation goes through this context — no server
         * round-trips, no webpack compilation on every route change.
         */}
        <ViewProvider>
          <AuthProvider>
            <I18nProvider>
              <AppProvider>
                <Sidebar />
                <div id="app">
                  {children}
                </div>
                <BottomNav />
                <CartDrawer />
                <ToastContainer />
                <InstallPrompt />
                <WishlistSync />
              </AppProvider>
            </I18nProvider>
          </AuthProvider>
        </ViewProvider>
      </body>
    </html>
  );
}
