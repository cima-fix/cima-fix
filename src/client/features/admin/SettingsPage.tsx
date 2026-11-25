import { useState } from 'react'
import { useFetcher, useLoaderData } from 'react-router'
import { mapLegend } from '../../../shared/domain/map-levels.ts'
import { MIN_ALERT_THRESHOLD, MIN_MAP_MEDIUM_THRESHOLD } from '../../../shared/domain/limits.ts'
import { LevelBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, Input } from '../../components/ui/Field'
import { ActionError, AdminScreen } from './AdminScreen'
import { Notice } from '../../components/ui/Notice'
import type { ActionResult, SettingsResult, settingsLoader } from './data'

const LEVEL_LABEL = { low: 'Bajo', medium: 'Medio', high: 'Alto' } as const

function Saved({ result, text }: { result: ActionResult | undefined; text: string }) {
  return (
    <p role="status" className="text-xs font-medium text-green-dark">
      {result?.ok ? text : ''}
    </p>
  )
}

function NumberField({
  label,
  name,
  defaultValue,
  hint,
  onChange,
}: {
  label: string
  name: string
  defaultValue: number | null
  hint: string
  onChange?: (value: string) => void
}) {
  return (
    <Field label={label} hint={hint}>
      {(c) => (
        <Input
          id={c.id}
          aria-describedby={c.describedBy}
          name={name}
          type="number"
          inputMode="numeric"
          step={1}
          defaultValue={defaultValue ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          className="lg:max-w-40"
        />
      )}
    </Field>
  )
}

// RF-NOTIFICACION-14, 15: a threshold of Nuevos and one of En revisión, each optional.
// The API cannot tell the saved values yet (only PUT exists, SDD 7.2), and the PUT replaces both
// thresholds, so the screen says so and shows what it saved.
function AlertThresholds() {
  const fetcher = useFetcher<SettingsResult>()
  const saved = fetcher.data?.ok ? fetcher.data.alert : undefined
  const describe = (value: number | null | undefined) => (value == null ? 'sin alerta' : String(value))
  return (
    <Card as="section" aria-labelledby="alert-title" className="flex flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="alert-title" className="text-base font-bold">
          Umbrales de alerta
        </h2>
        <p className="text-body text-neutral-text-secondary">
          Cuando los reportes abiertos del campus llegan al umbral, los Encargados y Admins del
          campus reciben un correo. Déjalo vacío para no recibir esa alerta.
        </p>
      </div>
      <Notice tone="info" className="text-body">
        Todavía no se pueden consultar los umbrales guardados. Al guardar se reemplazan los dos:
        escribe también el que quieras conservar.
      </Notice>
      <fetcher.Form method="post" noValidate className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="alert" />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Reportes Nuevos"
            name="new"
            defaultValue={null}
            hint={`Sin asignar. Número entero, ${MIN_ALERT_THRESHOLD} o más.`}
          />
          <NumberField
            label="Reportes En revisión"
            name="inReview"
            defaultValue={null}
            hint={`Asignados. Número entero, ${MIN_ALERT_THRESHOLD} o más.`}
          />
        </div>
        <ActionError result={fetcher.data} />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
          <Button type="submit" disabled={fetcher.state !== 'idle'} className="lg:w-auto lg:px-6">
            Guardar umbrales de alerta
          </Button>
          <Saved
            result={fetcher.data}
            text={`Umbrales de alerta guardados: Nuevos, ${describe(saved?.new)}; En revisión, ${describe(saved?.inReview)}.`}
          />
        </div>
      </fetcher.Form>
    </Card>
  )
}

// RF-MAPA-22…24: Medio and Alto together, or none; with a preview of the legend.
function MapThresholds({ value }: { value: { medium: number; high: number } | null }) {
  const fetcher = useFetcher<ActionResult>()
  const [medium, setMedium] = useState(value ? String(value.medium) : '')
  const [high, setHigh] = useState(value ? String(value.high) : '')
  const m = Number(medium)
  const h = Number(high)
  const valid =
    medium !== '' && high !== '' && Number.isInteger(m) && Number.isInteger(h) &&
    m >= MIN_MAP_MEDIUM_THRESHOLD && h > m
  const preview = valid ? mapLegend({ medium: m, high: h }) : null

  return (
    <Card as="section" aria-labelledby="map-title" className="flex flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="map-title" className="text-base font-bold">
          Umbrales del mapa
        </h2>
        <p className="text-body text-neutral-text-secondary">
          Definen el nivel del indicador de cada edificio según sus reportes abiertos. Sin umbrales,
          el mapa muestra solo el número.
        </p>
      </div>
      <fetcher.Form method="post" noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Nivel Medio desde"
            name="medium"
            defaultValue={value?.medium ?? null}
            hint={`Número entero, ${MIN_MAP_MEDIUM_THRESHOLD} o más.`}
            onChange={setMedium}
          />
          <NumberField
            label="Nivel Alto desde"
            name="high"
            defaultValue={value?.high ?? null}
            hint="Número entero, mayor que el de Medio."
            onChange={setHigh}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-neutral-text-muted">Así se verá la leyenda:</p>
          {preview ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Vista previa de la leyenda">
              {preview.map(({ level, min, max }) => (
                <li key={level}>
                  <LevelBadge level={level}>
                    {LEVEL_LABEL[level]}: {max === null ? `${min} o más` : `${min} a ${max}`}
                  </LevelBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-neutral-text-secondary">Sin niveles.</p>
          )}
        </div>
        <ActionError result={fetcher.data} />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
          <Button
            type="submit"
            name="intent"
            value="map"
            disabled={fetcher.state !== 'idle'}
            className="lg:w-auto lg:px-6"
          >
            Guardar umbrales del mapa
          </Button>
          {value && (
            <Button
              type="submit"
              name="intent"
              value="map-clear"
              variant="danger"
              disabled={fetcher.state !== 'idle'}
              className="lg:w-auto lg:px-6"
            >
              Retirar umbrales
            </Button>
          )}
          <Saved result={fetcher.data} text="Umbrales del mapa guardados." />
        </div>
      </fetcher.Form>
    </Card>
  )
}

// /campus/:slug/configuracion — alert thresholds and map thresholds (SDD 13.2), Admin only.
export function SettingsPage() {
  const { campus, allowed, mapThresholds } = useLoaderData<typeof settingsLoader>()

  return (
    <AdminScreen title="Configuración" subtitle={campus.name} allowed={allowed}>
      {allowed && (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <AlertThresholds />
          <MapThresholds
            // Remounts only when the thresholds are removed, to empty the fields.
            key={mapThresholds ? 'set' : 'none'}
            value={mapThresholds}
          />
        </div>
      )}
    </AdminScreen>
  )
}
