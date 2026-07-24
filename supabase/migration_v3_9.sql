-- ============================================================================
--  migration_v3_9.sql — field-agent store acquisition (freelance onboarding)
--
--  Re-frames the "agent" account from a product registrar into a freelance
--  MARKETER who signs up real stores:
--    1. A store owner signs up themselves (their own login).
--    2. Their store shows a short LINK CODE. They hand it to a field agent.
--    3. The agent enters the code → the store is attributed to that agent
--       (suppliers.registered_by_agent_id) and the agent may edit it WHILE it
--       is still in trial / pending (setting up the profile + products).
--    4. Agent submits for review (approval_status → 'pending').
--    5. An admin approves (approval_status → 'approved') → the agent instantly
--       loses edit access; the store owner runs their own store from then on.
--    6. The admin pays the agent a FIXED bounty per approved store, but only
--       when the store is actually paying its subscription. agent_bounty_amount
--       + agent_bounty_paid_at record that manual payout.
--
--  Self-registered stores (no agent) keep registered_by_agent_id = NULL — they
--  belong to themselves.
--
--  Idempotent: safe to run more than once.
-- ============================================================================

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS registered_by_agent_id BIGINT
      REFERENCES suppliers(id) ON DELETE SET NULL,   -- the agent who onboarded this store (NULL = self)
  ADD COLUMN IF NOT EXISTS agent_link_code        TEXT,          -- code the store hands to an agent
  ADD COLUMN IF NOT EXISTS agent_submitted_at     TIMESTAMPTZ,   -- when the agent submitted it for review
  ADD COLUMN IF NOT EXISTS agent_bounty_amount    NUMERIC(10,2), -- fixed bounty the admin agreed to pay
  ADD COLUMN IF NOT EXISTS agent_bounty_paid_at   TIMESTAMPTZ;   -- when the admin actually paid the agent

-- Give every existing sellable store a link code so an agent can be attached
-- retroactively. Agents and customers don't get one (they aren't onboarded).
UPDATE suppliers
   SET agent_link_code = upper(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 8))
 WHERE agent_link_code IS NULL
   AND account_type IN ('business', 'supplier');

-- A link code identifies exactly one store, so it must be unique (NULLs allowed
-- for agents/customers that have none).
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_agent_link_code_key
  ON suppliers(agent_link_code) WHERE agent_link_code IS NOT NULL;

-- Fast "which stores did this agent register" lookups for the agent dashboard.
CREATE INDEX IF NOT EXISTS suppliers_registered_by_agent_idx
  ON suppliers(registered_by_agent_id);
