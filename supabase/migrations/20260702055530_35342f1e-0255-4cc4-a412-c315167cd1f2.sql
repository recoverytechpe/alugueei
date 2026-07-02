
UPDATE public.profiles SET user_type='locador',   onboarded_at=COALESCE(onboarded_at, now()) WHERE id='11111111-1111-1111-1111-111111111111';
UPDATE public.profiles SET user_type='locatario', onboarded_at=COALESCE(onboarded_at, now()) WHERE id='22222222-2222-2222-2222-222222222222';
UPDATE public.profiles SET user_type='agente',    onboarded_at=COALESCE(onboarded_at, now()) WHERE id='33333333-3333-3333-3333-333333333333';
UPDATE public.profiles SET user_type=COALESCE(user_type,'locatario'), onboarded_at=COALESCE(onboarded_at, now()) WHERE id='2f46e8ed-bbb7-4291-b8a3-aff7fe9f520e';
