ALTER TABLE public.wallet_profiles ADD COLUMN phone_number TEXT, ADD COLUMN email_address TEXT;
COMMENT ON COLUMN public.wallet_profiles.phone_number IS 'Wallet-owner verified contact number; accessible only via privileged server reads.';
COMMENT ON COLUMN public.wallet_profiles.email_address IS 'Wallet-owner verified email address; accessible only via privileged server reads.';