'use client';

import dynamic from 'next/dynamic';

// Load the entire admin dashboard client-side only — never server-rendered.
// This prevents 500s from context hooks running before hydration.
const AdminDashboard = dynamic(
  () => import('@/components/AdminDashboard'),
  {
    ssr: false,
    loading: () => (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'80vh', flexDirection:'column', gap:12 }}>
        <div className="spinner" style={{ width:36, height:36 }} />
      </div>
    ),
  }
);

export default function AdminPage() {
  return <AdminDashboard />;
}
