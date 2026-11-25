import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useFetcher, useLoaderData } from 'react-router'
import { MAX_NAME_LENGTH } from '../../../shared/domain/limits.ts'
import { Chip, LevelBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, SectionLabel } from '../../components/ui/Card'
import { Dialog } from '../../components/ui/Dialog'
import { Input, Select } from '../../components/ui/Field'
import { CheckIcon, CopyIcon, MapPinIcon, PencilIcon } from '../../components/ui/icons'
import { cn } from '../../lib/cn'
import {
  CAMPUS,
  type ManagedBuilding,
  type ManagedCategory,
  type ManagedSpace,
  type Position,
} from '../../lib/demo-api'
import { PRIORITY_LABEL, type Priority } from '../../lib/reports'
import { ActionError, AdminScreen } from './AdminScreen'
import type { ActionResult, catalogLoader } from './data'

const SEVERITIES: Priority[] = ['low', 'medium', 'high']
const iconButton =
  'flex items-center gap-1.5 rounded-control px-2 py-1.5 text-xs font-semibold text-green-dark hover:bg-green-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-green disabled:opacity-50'

// Form that runs one catalog action and reports its error next to it.
function useCatalogFetcher(onDone?: () => void) {
  const fetcher = useFetcher<ActionResult>()
  const done = useRef(onDone)
  const wasBusy = useRef(false)
  useEffect(() => {
    done.current = onDone
  })
  useEffect(() => {
    if (fetcher.state !== 'idle') wasBusy.current = true
    else if (wasBusy.current) {
      wasBusy.current = false
      if (fetcher.data?.ok) done.current?.()
    }
  }, [fetcher.state, fetcher.data])
  return fetcher
}

// "Agregar edificio", "Agregar espacio": one name and a button (RF-CATALOGO-02, 04).
function AddByName({
  intent,
  id,
  label,
  placeholder,
  button,
}: {
  intent: string
  id?: string
  label: string
  placeholder: string
  button: string
}) {
  const form = useRef<HTMLFormElement>(null)
  const fetcher = useCatalogFetcher(() => form.current?.reset())
  return (
    <div className="flex flex-col gap-2">
      <fetcher.Form ref={form} method="post" noValidate className="flex gap-2">
        <input type="hidden" name="intent" value={intent} />
        {id && <input type="hidden" name="id" value={id} />}
        <Input
          name="name"
          aria-label={label}
          placeholder={placeholder}
          maxLength={MAX_NAME_LENGTH + 20}
          invalid={fetcher.data?.ok === false}
          className="py-2 text-sm"
        />
        <Button type="submit" size="sm" disabled={fetcher.state !== 'idle'} className="w-auto shrink-0 px-4">
          {button}
        </Button>
      </fetcher.Form>
      <ActionError result={fetcher.data} />
    </div>
  )
}

// Name with "Editar" that turns into a field (RF-CATALOGO-03, 05, 07). `extra` adds fields
// to the same form (the severity of a category).
function EditableName({
  intent,
  id,
  name,
  what,
  muted,
  extra,
  children,
}: {
  intent: string
  id: string
  name: string
  what: string
  muted?: boolean
  extra?: ReactNode
  children?: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const fetcher = useCatalogFetcher(() => setEditing(false))
  const inputId = useId()

  if (!editing) {
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className={cn('font-semibold', muted ? 'text-neutral-text-muted' : 'text-neutral-text')}>{name}</span>
        {children}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={iconButton}
          aria-label={`Editar ${what} ${name}`}
        >
          <PencilIcon className="size-3.5" />
          Editar
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <fetcher.Form method="post" noValidate className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="id" value={id} />
        <label htmlFor={inputId} className="sr-only">
          Nombre de {what}
        </label>
        <Input
          id={inputId}
          name="name"
          defaultValue={name}
          autoFocus
          invalid={fetcher.data?.ok === false}
          className="min-w-40 flex-1 py-1.5 text-sm"
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        />
        {extra}
        <Button type="submit" size="sm" disabled={fetcher.state !== 'idle'} className="w-auto px-3">
          Guardar
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="w-auto px-3">
          Cancelar
        </Button>
      </fetcher.Form>
      <ActionError result={fetcher.data} />
    </div>
  )
}

// RF-CATALOGO-09, 21: deactivate or reactivate; nothing is deleted (RF-CATALOGO-12).
function ToggleActive({ intent, id, isActive, label }: { intent: string; id: string; isActive: boolean; label: string }) {
  const fetcher = useCatalogFetcher()
  return (
    <div className="flex flex-col items-end gap-1">
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={String(!isActive)} />
        <button
          type="submit"
          disabled={fetcher.state !== 'idle'}
          aria-label={`${isActive ? 'Desactivar' : 'Reactivar'} ${label}`}
          className={cn(iconButton, isActive ? 'text-status-error hover:bg-status-error-bg' : '')}
        >
          {isActive ? 'Desactivar' : 'Reactivar'}
        </button>
      </fetcher.Form>
      {fetcher.data?.ok === false && (
        <p role="alert" className="max-w-72 text-right text-xs text-status-error">
          {fetcher.data.error}
        </p>
      )}
    </div>
  )
}

// RF-CATALOGO-14, 16: the link of a space and a button to copy it.
function SpaceLink({ code, space }: { code: string; space: string }) {
  const [copied, setCopied] = useState(false)
  const path = `/e/${code}`

  async function copy() {
    await navigator.clipboard?.writeText(`${window.location.origin}${path}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <span className="flex items-center gap-1">
      <a
        href={path}
        className="rounded-chip font-mono text-xs text-neutral-text-secondary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-green"
      >
        {path}
      </a>
      <button type="button" onClick={copy} className={iconButton} aria-label={`Copiar enlace de ${space}`}>
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        <span aria-live="polite">{copied ? 'Copiado' : 'Copiar'}</span>
      </button>
    </span>
  )
}

function SpaceRow({ space, buildingActive }: { space: ManagedSpace; buildingActive: boolean }) {
  return (
    <li className="flex flex-col gap-1 border-t border-card-border py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <EditableName intent="rename-space" id={space.id} name={space.name} what="el espacio" muted={!space.isActive}>
        {!space.isActive && <Chip tone="gray">Desactivado</Chip>}
      </EditableName>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <SpaceLink code={space.code} space={space.name} />
        <ToggleActive
          intent="toggle-space"
          id={space.id}
          isActive={space.isActive}
          label={`espacio ${space.name}`}
        />
      </div>
      {space.isActive && !buildingActive && (
        <p className="text-xs text-neutral-text-muted sm:hidden">No se ofrece: el edificio está desactivado.</p>
      )}
    </li>
  )
}

// RF-CATALOGO-13, 19: click on the plan or type the percentages; "Retirar" takes it away.
function PositionDialog({
  building,
  others,
  onClose,
}: {
  building: ManagedBuilding
  others: ManagedBuilding[]
  onClose: () => void
}) {
  const [position, setPosition] = useState<Position>(building.position ?? { x: 50, y: 50 })
  const fetcher = useCatalogFetcher(onClose)
  const busy = fetcher.state !== 'idle'
  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)))

  return (
    <Dialog labelledBy="position-title" onClose={onClose} className="sm:max-w-2xl">
      <fetcher.Form method="post" className="flex flex-col gap-4 p-5 lg:p-6">
        <input type="hidden" name="intent" value="position-building" />
        <input type="hidden" name="id" value={building.id} />
        <div className="flex flex-col gap-1">
          <h2 id="position-title" className="text-heading font-bold">
            Posición de {building.name} en el plano
          </h2>
          <p className="text-body text-neutral-text-secondary">
            Toca el plano donde está el edificio o escribe la posición en porcentaje.
          </p>
        </div>
        <div
          className="relative aspect-[3/2] cursor-crosshair overflow-hidden rounded-xl border border-card-border bg-canvas"
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            setPosition({
              x: clamp(((e.clientX - box.left) / box.width) * 100),
              y: clamp(((e.clientY - box.top) / box.height) * 100),
            })
          }}
          aria-hidden="true"
        >
          {others
            .filter((b) => b.position)
            .map((b) => (
              <span
                key={b.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-chip bg-neutral-white px-1.5 py-0.5 text-caption text-neutral-text-muted shadow-sm"
                style={{ left: `${b.position!.x}%`, top: `${b.position!.y}%` }}
              >
                {b.name}
              </span>
            ))}
          <span
            className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center text-green-dark"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
          >
            <span className="rounded-chip bg-green px-1.5 py-0.5 text-caption font-semibold text-neutral-white">
              {building.name}
            </span>
            <MapPinIcon className="size-6" />
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:w-80">
          {(['x', 'y'] as const).map((axis) => (
            <label key={axis} className="flex flex-col gap-1 text-body text-neutral-text-secondary">
              {axis === 'x' ? 'Horizontal (%)' : 'Vertical (%)'}
              <Input
                type="number"
                min={0}
                max={100}
                name={axis}
                value={position[axis]}
                onChange={(e) => setPosition((p) => ({ ...p, [axis]: clamp(Number(e.target.value)) }))}
                className="py-2"
              />
            </label>
          ))}
        </div>
        <ActionError result={fetcher.data} />
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {building.position && (
            <Button
              type="submit"
              name="clear"
              value="true"
              variant="danger"
              disabled={busy}
              className="sm:mr-auto sm:w-auto sm:px-4"
            >
              Retirar posición
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} className="sm:w-auto sm:px-5">
            Cancelar
          </Button>
          <Button type="submit" disabled={busy} className="sm:w-auto sm:px-5">
            Guardar posición
          </Button>
        </div>
      </fetcher.Form>
    </Dialog>
  )
}

function BuildingCard({ building, all }: { building: ManagedBuilding; all: ManagedBuilding[] }) {
  const [placing, setPlacing] = useState(false)
  const close = useCallback(() => setPlacing(false), [])
  const activeSpaces = building.spaces.filter((s) => s.isActive).length

  return (
    <Card as="li" className={cn('flex flex-col gap-3 p-4 lg:px-5', !building.isActive && 'bg-canvas/60')}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <EditableName
          intent="rename-building"
          id={building.id}
          name={building.name}
          what="el edificio"
          muted={!building.isActive}
        >
          {!building.isActive && <Chip tone="gray">Desactivado</Chip>}
        </EditableName>
        <ToggleActive
          intent="toggle-building"
          id={building.id}
          isActive={building.isActive}
          label={`edificio ${building.name}`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-text-muted">
        <span className="flex items-center gap-1">
          <MapPinIcon className="size-3.5" />
          {building.position
            ? `En el plano (${building.position.x}%, ${building.position.y}%)`
            : 'Sin posición en el plano'}
        </span>
        <button type="button" onClick={() => setPlacing(true)} className={iconButton}>
          {building.position ? 'Cambiar posición' : 'Indicar posición'}
          <span className="sr-only"> de {building.name}</span>
        </button>
        {/* RF-CATALOGO-10: a building without active spaces is not offered. */}
        {building.isActive && activeSpaces === 0 && <span>No se ofrece: no tiene espacios activos.</span>}
      </div>
      <ul aria-label={`Espacios de ${building.name}`} className="flex flex-col">
        {building.spaces.map((space) => (
          <SpaceRow key={space.id} space={space} buildingActive={building.isActive} />
        ))}
      </ul>
      <AddByName
        intent="create-space"
        id={building.id}
        label={`Nuevo espacio en ${building.name}`}
        placeholder={`Nuevo espacio en ${building.name}`}
        button="Agregar"
      />
      {placing && <PositionDialog building={building} others={all.filter((b) => b !== building)} onClose={close} />}
    </Card>
  )
}

function CategoryRow({ category }: { category: ManagedCategory }) {
  return (
    <li className="flex flex-col gap-2 border-t border-card-border py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <EditableName
        intent="update-category"
        id={category.id}
        name={category.name}
        what="la categoría"
        muted={!category.isActive}
        extra={
          <Select
            name="severity"
            aria-label="Gravedad"
            options={SEVERITIES.map((s) => PRIORITY_LABEL[s])}
            defaultValue={PRIORITY_LABEL[category.severity]}
            size="sm"
            className="w-28"
          />
        }
      >
        <LevelBadge level={category.severity}>Gravedad {PRIORITY_LABEL[category.severity].toLowerCase()}</LevelBadge>
        {!category.isActive && <Chip tone="gray">Desactivada</Chip>}
      </EditableName>
      <ToggleActive
        intent="toggle-category"
        id={category.id}
        isActive={category.isActive}
        label={`categoría ${category.name}`}
      />
    </li>
  )
}

// RF-CATALOGO-06, 18: name and severity.
function AddCategory() {
  const form = useRef<HTMLFormElement>(null)
  const fetcher = useCatalogFetcher(() => form.current?.reset())
  return (
    <div className="flex flex-col gap-2 border-t border-card-border pt-3">
      <fetcher.Form ref={form} method="post" noValidate className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input type="hidden" name="intent" value="create-category" />
        <Input
          name="name"
          aria-label="Nueva categoría"
          placeholder="Nueva categoría"
          invalid={fetcher.data?.ok === false}
          className="col-span-2 py-2 text-sm"
        />
        <Select
          name="severity"
          aria-label="Gravedad de la nueva categoría"
          options={SEVERITIES.map((s) => PRIORITY_LABEL[s])}
          defaultValue={PRIORITY_LABEL.medium}
          size="sm"
        />
        <Button type="submit" size="sm" disabled={fetcher.state !== 'idle'} className="w-auto px-4">
          Agregar
        </Button>
      </fetcher.Form>
      <ActionError result={fetcher.data} />
    </div>
  )
}

// /campus/:slug/catalogo — buildings, spaces with their link, categories and the position of
// each building on the plan (SDD 13.2, 3.3.1). Admin only. Includes deactivated items
// (RF-CATALOGO-20).
export function CatalogPage() {
  const { allowed, catalog } = useLoaderData<typeof catalogLoader>()

  return (
    <AdminScreen
      title="Catálogo"
      subtitle={`UABC ${CAMPUS.name} · Edificios, espacios y categorías`}
      allowed={allowed}
    >
      {catalog && (
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <section aria-labelledby="buildings-title" className="flex flex-col gap-3">
            <SectionLabel id="buildings-title">
              Edificios y espacios ({catalog.buildings.length})
            </SectionLabel>
            <Card className="p-4">
              <AddByName
                intent="create-building"
                label="Nuevo edificio"
                placeholder="Nombre del nuevo edificio"
                button="Agregar edificio"
              />
            </Card>
            <ul className="flex flex-col gap-3">
              {catalog.buildings.map((building) => (
                <BuildingCard key={building.id} building={building} all={catalog.buildings} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="categories-title" className="flex flex-col gap-3 lg:sticky lg:top-32">
            <SectionLabel id="categories-title">Categorías ({catalog.categories.length})</SectionLabel>
            <Card className="flex flex-col px-4 py-1 pb-4 lg:px-5">
              <ul>
                {catalog.categories.map((category) => (
                  <CategoryRow key={category.id} category={category} />
                ))}
              </ul>
              <AddCategory />
            </Card>
            <p className="text-xs text-neutral-text-muted">
              La gravedad es la prioridad con la que empieza cada reporte de la categoría.
            </p>
          </section>
        </div>
      )}
    </AdminScreen>
  )
}
