'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { LoginResponseDTO } from '@pos/shared';
import { api, ApiError } from '@/lib/api-client';
import { getAppMode } from '@/lib/app-mode';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuthStore } from '@/stores/auth-store';

const schema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

const inputClass =
  'w-full rounded-xl border border-sand-300 bg-white px-3 py-3 text-base outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.accessToken);
  const clear = useAuthStore((s) => s.clear);
  const [formError, setFormError] = useState<string | null>(null);

  const mode = getAppMode();
  const isAdminPortal = mode === 'admin';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });

  // Already signed in → validate role against current app mode before redirecting.
  useEffect(() => {
    if (hydrated && token) {
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        if (isAdminPortal && currentUser.role !== 'admin') {
          clear();
          setFormError('Only Admins can log into the Web Management Portal.');
          return;
        }
        if (!isAdminPortal && currentUser.role === 'admin') {
          clear();
          setFormError('Admin accounts cannot log into the POS Till App. Please use the Web Portal.');
          return;
        }
      }
      router.replace('/');
    }
  }, [hydrated, token, router, isAdminPortal, clear]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const res = await api.post<LoginResponseDTO>('/auth/login', values, { auth: false });
      
      // Role validation per app mode
      if (isAdminPortal && res.user.role !== 'admin') {
        setFormError('Only Admins can log into the Web Management Portal.');
        return;
      }
      if (!isAdminPortal && res.user.role === 'admin') {
        setFormError('Admin accounts cannot log into the POS Till App. Please use the Web Portal.');
        return;
      }

      setSession(res);
      router.replace('/');
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Unable to sign in. Is the API running?');
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-gradient p-4">
      <div className="card w-full max-w-sm overflow-hidden">
        <div className="h-1 w-full bg-accent-gradient" />
        <div className="p-7">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="logo-mark mb-3 h-14 w-14 text-2xl">G</span>
            <h1 className="text-2xl font-extrabold tracking-tight text-gradient">
              {isAdminPortal ? 'Grand Admin' : 'Grand POS'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isAdminPortal ? 'Sign in to Web Management Portal' : 'Sign in to POS Till Terminal'}
            </p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                autoComplete="username"
                autoFocus
                className={inputClass}
                {...register('username')}
              />
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
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p>
            ) : null}
            <Button type="submit" variant="accent" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
