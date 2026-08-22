'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { USER_ROLES, type AuthUserDTO } from '@pos/shared';
import { ApiError } from '@pos/client-core';
import { useAuthStore } from '@pos/client-core';
import { Button } from '@pos/client-core';
import { Modal } from '@pos/client-core';
import { FullscreenSpinner, Spinner } from '@pos/client-core';
import {
  useCreateUser,
  useDeleteUser,
  useSetUserPin,
  useUpdateUser,
  useUsers,
} from './api';
import { USER_ROLE_LABELS } from './format';
import { AdminPage, Badge, ErrorNote, Field, SectionCard, SelectInput, Table, TextInput } from './ui';

/** Users & roles (spec §7): staff accounts, roles, manager PINs, activation. */
export function UsersScreen() {
  const users = useUsers();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [editing, setEditing] = useState<AuthUserDTO | 'new' | null>(null);
  const [pinFor, setPinFor] = useState<AuthUserDTO | null>(null);
  const [deactivating, setDeactivating] = useState<AuthUserDTO | null>(null);

  if (users.isLoading) return <FullscreenSpinner label="Loading users…" />;

  return (
    <AdminPage
      title="Users & roles"
      subtitle="Staff accounts, roles and manager PINs. Deactivating preserves history instead of deleting."
      actions={<Button onClick={() => setEditing('new')}>Add user</Button>}
    >
      <SectionCard>
        <Table
          rows={users.data ?? []}
          keyOf={(u) => u.id}
          empty="No users yet."
          columns={[
            {
              header: 'Name',
              cell: (u) => (
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${u.isActive ? 'text-slate-900' : 'text-slate-400'}`}>{u.name}</span>
                  {u.id === currentUserId ? <Badge tone="brand">You</Badge> : null}
                </div>
              ),
            },
            { header: 'Username', cell: (u) => <span className="text-slate-500">{u.username}</span> },
            { header: 'Role', cell: (u) => <Badge tone="slate">{USER_ROLE_LABELS[u.role]}</Badge> },
            {
              header: 'PIN',
              cell: (u) =>
                u.hasPin ? <Badge tone="green">Set</Badge> : <span className="text-xs text-slate-400">None</span>,
            },
            {
              header: 'Status',
              cell: (u) => (u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>),
            },
            {
              header: '',
              align: 'right',
              cell: (u) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" onClick={() => setPinFor(u)}>
                    {u.hasPin ? 'Change PIN' : 'Set PIN'}
                  </Button>
                  {u.isActive ? (
                    <DeactivateButton user={u} disabled={u.id === currentUserId} onClick={() => setDeactivating(u)} />
                  ) : (
                    <ReactivateButton user={u} />
                  )}
                  <Button variant="secondary" onClick={() => setEditing(u)}>
                    Edit
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </SectionCard>

      {editing ? <UserModal user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {pinFor ? <PinModal user={pinFor} onClose={() => setPinFor(null)} /> : null}
      {deactivating ? <DeactivateModal user={deactivating} onClose={() => setDeactivating(null)} /> : null}
    </AdminPage>
  );
}

function DeactivateButton({
  user,
  disabled,
  onClick,
}: {
  user: AuthUserDTO;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'You cannot deactivate your own account' : `Deactivate ${user.name}`}
    >
      Deactivate
    </Button>
  );
}

function ReactivateButton({ user }: { user: AuthUserDTO }) {
  const update = useUpdateUser();
  return (
    <Button variant="ghost" onClick={() => update.mutate({ id: user.id, body: { isActive: true } })} disabled={update.isPending}>
      Reactivate
    </Button>
  );
}

// --- Create / edit user ------------------------------------------------------

const userSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    username: z.string().trim().min(3, 'At least 3 characters'),
    password: z.string(),
    role: z.enum(USER_ROLES as unknown as [string, ...string[]]),
    pin: z.string().trim(),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    // Password required on create (handled via isEdit flag passed through defaults) — validated in-component.
    if (v.password !== '' && v.password.length < 6) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'At least 6 characters' });
    }
    if (v.pin !== '' && (v.pin.length < 4 || v.pin.length > 8 || !/^\d+$/.test(v.pin))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pin'], message: '4-8 digits' });
    }
  });
type UserValues = z.infer<typeof userSchema>;

function UserModal({ user, onClose }: { user: AuthUserDTO | null; onClose: () => void }) {
  const isEdit = !!user;
  const create = useCreateUser();
  const update = useUpdateUser();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<UserValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: user?.name ?? '',
      username: user?.username ?? '',
      password: '',
      role: user?.role ?? 'waiter',
      pin: '',
      isActive: user?.isActive ?? true,
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    if (!isEdit && v.password.length < 6) {
      setFieldError('password', { message: 'At least 6 characters' });
      return;
    }
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: user.id,
          body: {
            name: v.name,
            username: v.username,
            role: v.role as AuthUserDTO['role'],
            isActive: v.isActive,
            ...(v.password ? { password: v.password } : {}),
          },
        });
      } else {
        await create.mutateAsync({
          name: v.name,
          username: v.username,
          password: v.password,
          role: v.role as AuthUserDTO['role'],
          pin: v.pin || undefined,
        });
      }
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 409
            ? 'That username is already taken.'
            : e.message
          : 'Could not save the user',
      );
    }
  });

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${user.name}` : 'New user'} widthClassName="max-w-md">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="u-name" error={errors.name?.message}>
          <TextInput id="u-name" autoFocus {...register('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username" htmlFor="u-username" error={errors.username?.message}>
            <TextInput id="u-username" autoComplete="off" {...register('username')} />
          </Field>
          <Field label="Role" htmlFor="u-role">
            <SelectInput id="u-role" {...register('role')}>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS[r]}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <Field
          label={isEdit ? 'New password' : 'Password'}
          htmlFor="u-password"
          error={errors.password?.message}
          hint={isEdit ? 'Leave blank to keep the current password' : 'At least 6 characters'}
        >
          <TextInput id="u-password" type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        {!isEdit ? (
          <Field
            label="Manager PIN (optional)"
            htmlFor="u-pin"
            error={errors.pin?.message}
            hint="4-8 digits, for override-gated actions"
          >
            <TextInput id="u-pin" inputMode="numeric" autoComplete="off" {...register('pin')} />
          </Field>
        ) : (
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-5 w-5" {...register('isActive')} /> Active account
          </label>
        )}
        <ErrorNote message={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Set / change PIN --------------------------------------------------------

function PinModal({ user, onClose }: { user: AuthUserDTO; onClose: () => void }) {
  const setPin = useSetUserPin();
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!/^\d{4,8}$/.test(pin)) {
      setError('PIN must be 4-8 digits.');
      return;
    }
    try {
      await setPin.mutateAsync({ id: user.id, pin });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not set the PIN');
    }
  };

  return (
    <Modal open onClose={onClose} title={`${user.hasPin ? 'Change' : 'Set'} PIN - ${user.name}`} widthClassName="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          The manager PIN authorises override actions (voids, discounts, split/merge) for non-admin staff.
        </p>
        <Field label="PIN" htmlFor="pin-input" error={error ?? undefined}>
          <TextInput
            id="pin-input"
            type="password"
            inputMode="numeric"
            autoFocus
            autoComplete="off"
            value={pin}
            onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 8))}
          />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={save} disabled={setPin.isPending}>
            {setPin.isPending ? <Spinner /> : 'Save PIN'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// --- Deactivate --------------------------------------------------------------

function DeactivateModal({ user, onClose }: { user: AuthUserDTO; onClose: () => void }) {
  const del = useDeleteUser();
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    try {
      await del.mutateAsync(user.id);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not deactivate the user');
    }
  };
  return (
    <Modal open onClose={onClose} title="Deactivate user" widthClassName="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Deactivate <span className="font-semibold">{user.name}</span>? They will no longer be able to sign in. Their
          order and audit history is preserved, and you can reactivate them later.
        </p>
        <ErrorNote message={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={run} disabled={del.isPending}>
            {del.isPending ? <Spinner /> : 'Deactivate'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
