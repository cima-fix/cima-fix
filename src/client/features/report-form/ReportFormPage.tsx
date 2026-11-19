import { useState, type FormEvent } from 'react'
import { useLoaderData } from 'react-router'
import { ScreenHeader } from '../../components/layout/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Field, Select, Textarea } from '../../components/ui/Field'
import { Notice } from '../../components/ui/Notice'
import {
  ApiError,
  createReport,
  findSimilarReports,
  type Catalog,
  type ReportDraft,
} from '../../lib/demo-api'
import { formatNumber } from '../../lib/format'
import type { Report } from '../../lib/reports'
import { DuplicatesStep } from './DuplicatesStep'
import { PhotoPicker, type Photo } from './PhotoPicker'
import { SubmittedStep } from './SubmittedStep'

const MAX_DESCRIPTION = 1000

type Values = Omit<ReportDraft, 'photoCount'>
type Errors = Partial<Record<keyof Values, string>>

function validate(values: Values): Errors {
  const errors: Errors = {}
  if (!values.building) errors.building = 'Elige un edificio para continuar.'
  if (!values.space) errors.space = 'Elige un espacio para continuar.'
  if (!values.category) errors.category = 'Elige una categoría para continuar.'
  const length = values.description.trim().length
  if (length === 0) errors.description = 'Cuéntanos qué pasa para continuar.'
  else if (length > MAX_DESCRIPTION) {
    errors.description = `Pasaste el límite: ${formatNumber(length)} de ${formatNumber(MAX_DESCRIPTION)} caracteres.`
  }
  return errors
}

type Step =
  | { name: 'form' }
  | { name: 'duplicates'; draft: ReportDraft; similar: Report[] }
  | { name: 'submitted'; report: Report }

// /reportar — Figma frames 1 (form), 2 (possible duplicates), 3 (errors) and 4 (sent).
export function ReportFormPage() {
  const catalog = useLoaderData<Catalog>()
  const initial: Values = {
    campus: catalog.campuses[0] ?? '',
    building: '',
    space: '',
    category: '',
    description: '',
  }
  const [values, setValues] = useState(initial)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const [banner, setBanner] = useState<{ tone: 'warning' | 'error'; text: string }>()
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<Step>({ name: 'form' })

  const spaces = catalog.buildings.find((b) => b.name === values.building)?.spaces ?? []

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => {
      const next = { ...current, [key]: value }
      // Dependent selects (RF-REPORTE-12): a new building clears the space.
      if (key === 'building') next.space = ''
      return next
    })
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }))
  }

  async function submit(draft: ReportDraft) {
    setBusy(true)
    setBanner(undefined)
    try {
      const report = await createReport(draft)
      setStep({ name: 'submitted', report })
    } catch (error) {
      setStep({ name: 'form' })
      if (error instanceof ApiError && error.code === 'SPACE_UNAVAILABLE') {
        setBanner({ tone: 'warning', text: error.message })
        setValues((current) => ({ ...current, space: '' }))
        setErrors({ space: 'Elige un espacio para continuar.' })
      } else {
        setBanner({
          tone: 'error',
          text: error instanceof Error ? error.message : 'No pudimos enviar el reporte.',
        })
      }
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0 || photos.some((p) => p.error)) return

    const draft: ReportDraft = {
      ...values,
      description: values.description.trim(),
      photoCount: photos.length,
    }
    setBusy(true)
    const similar = await findSimilarReports(draft)
    setBusy(false)
    // RF-DUPLICADO: show open look-alikes before creating a new report.
    if (similar.length > 0) setStep({ name: 'duplicates', draft, similar })
    else await submit(draft)
  }

  function startOver() {
    setValues(initial)
    setPhotos([])
    setErrors({})
    setBanner(undefined)
    setStep({ name: 'form' })
  }

  if (step.name === 'duplicates') {
    return (
      <DuplicatesStep
        building={step.draft.building}
        similar={step.similar}
        busy={busy}
        onBack={() => setStep({ name: 'form' })}
        onContinue={() => submit(step.draft)}
      />
    )
  }

  if (step.name === 'submitted') {
    return <SubmittedStep report={step.report} onNewReport={startOver} />
  }

  const descriptionLength = values.description.trim().length

  return (
    <>
      <ScreenHeader title="Nuevo reporte" backTo="/" />
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3 px-4 py-3.5">
        {banner?.tone === 'warning' && (
          <Notice tone="warning" className="text-body">
            {banner.text}
          </Notice>
        )}

        <Field label="Campus" error={errors.campus}>
          {(c) => (
            <Select
              id={c.id}
              aria-describedby={c.describedBy}
              invalid={c.invalid}
              options={catalog.campuses}
              value={values.campus}
              onChange={(e) => set('campus', e.target.value)}
            />
          )}
        </Field>

        <Field label="Edificio" error={errors.building}>
          {(c) => (
            <Select
              id={c.id}
              aria-describedby={c.describedBy}
              invalid={c.invalid}
              placeholder="Elige un edificio"
              options={catalog.buildings.map((b) => b.name)}
              value={values.building}
              onChange={(e) => set('building', e.target.value)}
            />
          )}
        </Field>

        <Field label="Espacio" error={errors.space}>
          {(c) => (
            <Select
              id={c.id}
              aria-describedby={c.describedBy}
              invalid={c.invalid}
              placeholder="Elige un espacio"
              options={spaces}
              disabled={!values.building}
              value={values.space}
              onChange={(e) => set('space', e.target.value)}
            />
          )}
        </Field>

        <Field label="Categoría" error={errors.category}>
          {(c) => (
            <Select
              id={c.id}
              aria-describedby={c.describedBy}
              invalid={c.invalid}
              placeholder="Elige una categoría"
              options={catalog.categories.map((cat) => cat.name)}
              value={values.category}
              onChange={(e) => set('category', e.target.value)}
            />
          )}
        </Field>

        <Field
          label="Descripción"
          error={errors.description}
          hint={
            errors.description
              ? undefined
              : `${formatNumber(descriptionLength)} / ${formatNumber(MAX_DESCRIPTION)}`
          }
          hintAlign="end"
        >
          {(c) => (
            <Textarea
              id={c.id}
              aria-describedby={c.describedBy}
              invalid={c.invalid}
              placeholder="Cuéntanos qué pasa"
              rows={3}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
            />
          )}
        </Field>

        <PhotoPicker photos={photos} onChange={setPhotos} />

        {banner?.tone === 'error' && (
          <Notice tone="error" className="text-body">
            {banner.text}
          </Notice>
        )}

        <Button type="submit" disabled={busy} className="mt-1">
          {busy ? 'Enviando…' : 'Enviar reporte'}
        </Button>
      </form>
    </>
  )
}
