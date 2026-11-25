import { useEffect, useRef } from 'react'
import { useFetcher, useLoaderData } from 'react-router'
import type { StaffRole } from '../../../shared/types/common.ts'
import { Chip } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, SectionLabel } from '../../components/ui/Card'
import { Field, Input, Select } from '../../components/ui/Field'
import { Notice } from '../../components/ui/Notice'
import { UserIcon } from '../../components/ui/icons'
import { CAMPUS, CURRENT_USER, type RoleAccount } from '../../lib/demo-api'
import { ROLE_LABEL } from '../../lib/session'
import { ActionError, AdminScreen } from './AdminScreen'
import type { ActionResult, staffLoader } from './data'

function RoleChip({ account }: { account: RoleAccount }) {
  const label = ROLE_LABEL[account.role]
  return (
    <Chip tone={account.role === 'admin' ? 'blue' : 'green'}>
      {account.email === CURRENT_USER ? `Tú · ${label}` : label}
    </Chip>
  )
}

// One account with a role. An Admin can change its role or take it away (RF-ACCESO-06, 07).
function Person({ account, canManage }: { account: RoleAccount; canManage: boolean }) {
  const fetcher = useFetcher<ActionResult>()
  const busy = fetcher.state !== 'idle'
  const other: StaffRole = account.role === 'admin' ? 'staff' : 'admin'

  return (
    <Card as="li" className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas text-neutral-text-secondary">
          <UserIcon className="size-4.5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-neutral-text">{account.email}</span>
          {!account.hasSignedIn && (
            <span className="text-caption text-neutral-text-muted">Aún no ha iniciado sesión</span>
          )}
        </div>
        <RoleChip account={account} />
      </div>
      {canManage && (
        <fetcher.Form method="post" className="flex flex-wrap justify-end gap-2 pl-12">
          <input type="hidden" name="email" value={account.email} />
          <input type="hidden" name="role" value={other} />
          <Button
            type="submit"
            name="intent"
            value="assign"
            variant="secondary"
            size="sm"
            disabled={busy}
            className="w-auto px-3"
            aria-label={`Cambiar a ${ROLE_LABEL[other]}: ${account.email}`}
          >
            Cambiar a {ROLE_LABEL[other]}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="remove"
            variant="danger"
            size="sm"
            disabled={busy}
            className="w-auto px-3"
            aria-label={`Retirar rol: ${account.email}`}
          >
            Retirar rol
          </Button>
        </fetcher.Form>
      )}
      <ActionError result={fetcher.data} />
    </Card>
  )
}

// RF-ACCESO-06, 08: give a role by institutional email.
function AssignRoleForm() {
  const fetcher = useFetcher<ActionResult>()
  const form = useRef<HTMLFormElement>(null)
  const done = fetcher.state === 'idle' && fetcher.data?.ok

  useEffect(() => {
    if (done) form.current?.reset()
  }, [done])

  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.error : undefined

  return (
    <Card className="flex flex-col gap-3 p-4 lg:p-5">
      <h2 className="text-sm font-bold">Asignar un rol</h2>
      <fetcher.Form
        ref={form}
        method="post"
        noValidate
        className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_12rem_auto] lg:items-start"
      >
        <input type="hidden" name="intent" value="assign" />
        <Field label="Correo institucional" error={error}>
          {(c) => (
            <Input
              id={c.id}
              aria-describedby={c.describedBy}
              invalid={c.invalid}
              name="email"
              type="email"
              autoComplete="off"
              placeholder="nombre.apellido@uabc.edu.mx"
            />
          )}
        </Field>
        <Field label="Rol">
          {(c) => (
            <Select
              id={c.id}
              aria-describedby={c.describedBy}
              name="role"
              options={Object.values(ROLE_LABEL)}
              defaultValue={ROLE_LABEL.staff}
            />
          )}
        </Field>
        <Button type="submit" disabled={fetcher.state !== 'idle'} className="lg:mt-5.5 lg:w-auto lg:px-6">
          Asignar rol
        </Button>
      </fetcher.Form>
      <p className="text-xs text-neutral-text-muted">
        La cuenta queda con el rol aunque todavía no haya iniciado sesión.
      </p>
    </Card>
  )
}

function Group({ title, accounts, canManage }: { title: string; accounts: RoleAccount[]; canManage: boolean }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <SectionLabel>
        {title} ({accounts.length})
      </SectionLabel>
      <ul className="flex flex-col gap-3">
        {accounts.map((account) => (
          <Person key={account.email} account={account} canManage={canManage} />
        ))}
      </ul>
    </section>
  )
}

// /campus/:slug/personal — Figma frame "Personal · Encargado · Escritorio". The Encargado only
// reads; the Admin also assigns and takes away roles (RF-ACCESO-05…12).
export function StaffPage() {
  const { allowed, canManage, roles } = useLoaderData<typeof staffLoader>()

  return (
    <AdminScreen
      title="Personal"
      subtitle={`UABC ${CAMPUS.name}${canManage ? '' : ' · Solo lectura'}`}
      allowed={allowed}
    >
      {canManage ? (
        <AssignRoleForm />
      ) : (
        <Notice tone="info" className="text-body lg:px-4 lg:py-3">
          Solo un Admin puede asignar o retirar roles en este campus.
        </Notice>
      )}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <Group
          title="Administradores"
          accounts={roles.filter((r) => r.role === 'admin')}
          canManage={canManage}
        />
        <Group
          title="Encargados"
          accounts={roles.filter((r) => r.role === 'staff')}
          canManage={canManage}
        />
      </div>
    </AdminScreen>
  )
}
