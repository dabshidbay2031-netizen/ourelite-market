/**
 * Field-agent commission model — the SINGLE source of truth for how a field
 * agent (account_type='agent', a product registrar / lead generator) earns.
 *
 * An agent is paid to grow the catalog: a flat bounty per product they register,
 * a bonus each time a store actually starts stocking one of their products (a
 * converted lead), plus one-time milestone bonuses as they hit registration
 * tiers. Pure functions only — no I/O — so it's trivially testable and can run
 * on client or server. Tune the numbers here and everything updates.
 */

export interface AgentStats {
  productsRegistered: number;
  storesReached:      number; // distinct stores stocking this agent's products
  unitsSold:          number;
}

/** Money knobs (USD). */
export const COMMISSION = {
  perRegistration: 2,  // $ per product added to the catalog (the lead bounty)
  perStoreReached: 5,  // $ bonus when a store starts stocking one of your products
} as const;

export interface Tier {
  name:  string;
  emoji: string;
  min:   number; // registrations needed to reach this tier
  bonus: number; // one-time $ bonus on reaching it
}

/** Registration tiers, ascending. Bronze is the entry tier (min 0). */
export const TIERS: Tier[] = [
  { name: 'Bronze',   emoji: '🥉', min: 0,   bonus: 0   },
  { name: 'Silver',   emoji: '🥈', min: 50,  bonus: 50  },
  { name: 'Gold',     emoji: '🥇', min: 150, bonus: 200 },
  { name: 'Platinum', emoji: '💎', min: 400, bonus: 750 },
];

/** The highest tier whose threshold the agent has reached. */
export function currentTier(registrations: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (registrations >= tier.min) t = tier;
  return t;
}

/** The next tier up, or null when already at the top. */
export function nextTier(registrations: number): Tier | null {
  return TIERS.find(t => t.min > registrations) ?? null;
}

export interface TierProgress {
  current: Tier;
  next:    Tier | null;
  toNext:  number; // registrations still needed to reach `next` (0 at top)
  pct:     number; // 0–100 progress through the CURRENT tier toward `next`
}

/** Progress through the current tier toward the next one (100% at the top). */
export function tierProgress(registrations: number): TierProgress {
  const current = currentTier(registrations);
  const next    = nextTier(registrations);
  if (!next) return { current, next: null, toNext: 0, pct: 100 };
  const span = next.min - current.min;
  const done = registrations - current.min;
  return {
    current,
    next,
    toNext: next.min - registrations,
    pct: Math.max(0, Math.min(100, Math.round((done / span) * 100))),
  };
}

export interface CommissionBreakdown {
  registration: number; // bounty for products registered
  adoption:     number; // bonus for stores reached
  milestone:    number; // sum of tier bonuses already earned
  total:        number;
}

/** Total commission earned so far, broken down by source. */
export function computeCommission(stats: Pick<AgentStats, 'productsRegistered' | 'storesReached'>): CommissionBreakdown {
  const reg   = Math.max(0, stats.productsRegistered);
  const stores = Math.max(0, stats.storesReached);
  const registration = reg * COMMISSION.perRegistration;
  const adoption     = stores * COMMISSION.perStoreReached;
  const milestone    = TIERS.reduce((s, t) => (reg >= t.min ? s + t.bonus : s), 0);
  return { registration, adoption, milestone, total: registration + adoption + milestone };
}
