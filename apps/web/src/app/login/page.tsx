'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { LoginResponseDTO } from '@pos/shared';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuthStore } from '@/stores/auth-store';

const schema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

const inputClass =
  'w-full rounded-xl border border-slate-300 px-3 py-3 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500';

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.accessToken);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });

  // Already signed in → skip the form.
  useEffect(() => {
    if (hydrated && token) router.replace('/');
  }, [hydrated, token, router]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const res = await api.post<LoginResponseDTO>('/auth/login', values, { auth: false });
      setSession(res);
      router.replace('/');
    } catch (e) {
      setFormError(
        e instanceof ApiError ? e.message : 'Unable to sign in. Is the API running?',
      );
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-extrabold text-brand-700">Grand&nbsp;POS</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your terminal</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="username">
              Username
            </label>
            <input id="username" autoComplete="username" autoFocus className={inputClass} {...register('username')} />
            {errors.username ? (
              <p className="mt-1 text-sm text-red-600">{errors.username.message}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className={inputClass}
              {...register('password')}
            />
            {errors.password ? (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            ) : null}
          </div>
          {formError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">
          Demo: admin / pos1234 · manager PIN 1234
        </p>
      </div>
    </div>
  );
}
