
UPDATE public.profiles
SET terms_accepted_at = COALESCE(terms_accepted_at, now()),
    terms_version    = COALESCE(terms_version, '1.0'),
    privacy_accepted_at = COALESCE(privacy_accepted_at, now()),
    privacy_version  = COALESCE(privacy_version, '1.0')
WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '2f46e8ed-bbb7-4291-b8a3-aff7fe9f520e'
);
