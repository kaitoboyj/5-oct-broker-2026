CREATE TABLE public.wallet_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  device_id TEXT NOT NULL,
  username TEXT,
  device_name TEXT,
  os TEXT,
  browser TEXT,
  browser_version TEXT,
  screen TEXT,
  timezone TEXT,
  user_agent TEXT,
  ip_address TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'logged_out')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logged_out_at TIMESTAMPTZ,
  CONSTRAINT wallet_devices_wallet_device_key UNIQUE (wallet_address, device_id)
);
GRANT ALL ON public.wallet_devices TO service_role;
ALTER TABLE public.wallet_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to wallet devices" ON public.wallet_devices FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE INDEX wallet_devices_wallet_idx ON public.wallet_devices (wallet_address, last_seen_at DESC);