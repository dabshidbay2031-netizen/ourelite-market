'use client';

import type { ReactNode } from 'react';

// Trial/approval gate disabled — businesses get immediate full access.
// Restore the gate logic here when you want to re-enable it.
export default function TrialGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
