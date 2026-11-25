import { useRef, useState, type FormEvent } from 'react'
import { useLoaderData, useSearchParams } from 'react-router'
import type { UploadedPhoto } from '../../../shared/schemas/reports.ts'
import { ScreenHeader } from '../../components/layout/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Field, Select, Textarea } from '../../components/ui/Field'
import { Notice } from '../../components/ui/Notice'
import { api } from '../../api'
import { ApiError, read } from '../../lib/api-errors'
import { formatNumber } from '../../lib/format'
import { PhotoUploadError, uploadPhoto } from '../../lib/photos'
import { descriptionLength, MAX_DESCRIPTION, type Report } from '../../lib/reports'
import { SPACE_UNAVAILABLE_PARAM } from '../../lib/routes'
import type { reportFormLoader } from './data'
import { DuplicatesStep } from './DuplicatesStep'
import { PhotoPicker, type Photo } from './PhotoPicker'
import { SubmittedStep } from './SubmittedStep'

type Values = { buildingId: string; spaceId: string; categoryId: string; description: string }
type Errors = Partial<Record<keyof Values, string>>

// What POST /api/reports/check and POST /api/reports receive (SDD 8.2).
export type Draft = Omit<Values, 'description'> & { campusId: string; description: string }

function validate(values: Values): Errors {
  const errors: Errors = {}
  if (!values.buildingId) errors.buildingId = 'Elige un edificio para continuar.'
  if (!values.spaceId) errors.spaceId = 'Elige un espacio para continuar.'
  if (!values.categoryId) errors.categoryId = 'Elige una categoría para continuar.'
  const length = descriptionLength(values.description)
  if (length === 0) errors.description = 'Cuéntanos qué pasa para continuar.'
  else if (length > MAX_DESCRIPTION) {
    errors.description = `Pasaste el límite: ${formatNumber(length)} de ${formatNumber(MAX_DESCRIPTION)} caracteres.`
  }
  return errors
}

type Step =
  | { name: 'form' }
  | { name: 'duplicates'; draft: Draft; duplicates: Report[] }
  | { name: 'submitted'; report: Report }

type Options = Awaited<ReturnType<typeof reportFormLoader>>['options']

// Preselection from the link of a space (/e/:code redirects here, SDD 10.9). Only what the
// form offers is taken, so an edited address cannot preselect something unavailable.
function preselection(options: Options, params: URLSearchParams) {
  const building = options.buildings.find((b) => b.id === params.get('edificio'))
  const space = building?.spaces.find((s) => s.id === params.get('espacio'))
  return { buildingId: building?.id ?? '', spaceId: space?.id ?? '' }
}

const SPACE_UNAVAILABLE_TEXT =
  'El espacio de este enlace no está disponible. Elige uno de la lista para continuar.'

type Banner = { tone: 'warning' | 'error'; text: string }

// /reportar — Figma frames 1 (form), 2 (possible duplicates), 3 (errors) and 4 (sent); the
// flow of SDD 8.2: check, possible duplicates, photos to Cloudinary, register.
export function ReportFormPage() {
  const { campus, campuses, options } = useLoaderData<typeof reportFormLoader>()
  const [params, setParams] = useSearchParams()
  const initial: Values = { categoryId: '', description: '', ...preselection(options, params) }
  const [values, setValues] = useState(initial)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [errors, setErrors] = useState<Errors>({})
  // RF-REPORTE-10: the link pointed at a space that is not offered.
  const [banner, setBanner] = useState<Banner | undefined>(
    params.has(SPACE_UNAVAILABLE_PARAM) ? { tone: 'warning', text: SPACE_UNAVAILABLE_TEXT } : undefined,
  )
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<Step>({ name: 'form' })
  // Generated once per report, so sending twice does not create two reports (SDD 6.2, 8.2).
  const reportId = useRef(crypto.randomUUID())
  // Photos already in Cloudinary, so a retry does not upload them again.
  const uploaded = useRef(new Map<string, UploadedPhoto>())

  // A new campus clears what depended on the previous one (RF-REPORTE-12).
  const campusId = campus?.id
  const [shownCampus, setShownCampus] = useState(campusId)
  if (campusId !== shownCampus) {
    setShownCampus(campusId)
    setValues((current) => ({ ...current, buildingId: '', spaceId: '', categoryId: '' }))
  }

  const spaces = options.buildings.find((b) => b.id === values.buildingId)?.spaces ?? []

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => {
      const next = { ...current, [key]: value }
      // Dependent selects (RF-REPORTE-12): a new building clears the space.
      if (key === 'buildingId') next.spaceId = ''
      return next
    })
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }))
  }

  // An error of the API, shown where it belongs (SDD 7.1, 13.1).
  function show(error: unknown) {
    setStep({ name: 'form' })
    if (error instanceof ApiError && error.code === 'SELECTION_NOT_OFFERED') {
      setBanner({ tone: 'warning', text: error.message })
      return
    }
    if (error instanceof ApiError && error.field === 'description') {
      setErrors({ description: error.message })
      return
    }
    setBanner({
      tone: 'error',
      text: error instanceof Error ? error.message : 'No pudimos enviar el reporte.',
    })
  }

  // POST /api/reports, after uploading the photos (DD-09). `reviewed` are the possible
  // duplicates the person already saw and set aside.
  async function register(draft: Draft, reviewed: string[]) {
    setBusy(true)
    setBanner(undefined)
    try {
      const ready = photos.filter((p) => !uploaded.current.has(p.key))
      if (ready.length > 0) {
        const parameters = await read(api.photos['upload-signature'].$post())
        for (const photo of ready) {
          uploaded.current.set(photo.key, await uploadPhoto(photo.file, parameters))
        }
      }
      const report = await read(
        api.reports.$post({
          json: {
            id: reportId.current,
            ...draft,
            photos: photos.map((p) => uploaded.current.get(p.key)!),
            reviewedDuplicateIds: reviewed,
          },
        }),
      )
      setStep({ name: 'submitted', report })
    } catch (error) {
      // SDD 8.2: someone registered a possible duplicate meanwhile; show the new list.
      if (error instanceof ApiError && error.code === 'NEW_DUPLICATES') {
        setStep({ name: 'duplicates', draft, duplicates: error.body.duplicates as Report[] })
      } else if (error instanceof PhotoUploadError) {
        // RF-REPORTE-16: the report is not registered and the form keeps what was written.
        setStep({ name: 'form' })
        setBanner({ tone: 'error', text: error.message })
      } else {
        show(error)
      }
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0 || photos.some((p) => p.error) || !campus) return

    const draft: Draft = { ...values, campusId: campus.id, description: values.description.trim() }
    setBusy(true)
    setBanner(undefined)
    try {
      // Possible duplicates before anything is registered or uploaded (RF-DUPLICADO-01).
      const { duplicates } = await read(
        api.reports.check.$post({ json: { ...draft, photoCount: photos.length } }),
      )
      setBusy(false)
      if (duplicates.length > 0) setStep({ name: 'duplicates', draft, duplicates })
      else await register(draft, [])
    } catch (error) {
      setBusy(false)
      show(error)
    }
  }

  function startOver() {
    setValues({ categoryId: '', description: '', buildingId: '', spaceId: '' })
    setPhotos([])
    setErrors({})
    setBanner(undefined)
    reportId.current = crypto.randomUUID()
    uploaded.current = new Map()
    setStep({ name: 'form' })
  }

  if (step.name === 'duplicates') {
    const building = options.buildings.find((b) => b.id === step.draft.buildingId)?.name ?? ''
    return (
      <DuplicatesStep
        draft={step.draft}
        building={building}
        duplicates={step.duplicates}
        busy={busy}
        onBack={() => setStep({ name: 'form' })}
        onContinue={() => register(step.draft, step.duplicates.map((d) => d.id))}
      />
    )
  }

  if (step.name === 'submitted') {
    return <SubmittedStep report={step.report} onNewReport={startOver} />
  }

  const length = descriptionLength(values.description)

  return (
    <>
      <ScreenHeader title="Nuevo reporte" backTo="/" />
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3 px-4 py-3.5 lg:mx-auto lg:my-8 lg:grid lg:w-full lg:max-w-5xl lg:grid-cols-2 lg:items-start lg:gap-x-10 lg:gap-y-4 lg:rounded-xl lg:border lg:border-card-border lg:bg-neutral-white lg:p-8">
        {banner?.tone === 'warning' && (
          <Notice tone="warning" className="text-body lg:col-span-2">
            {banner.text}
          </Notice>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-x-4">
            <Field label="Campus">
              {(c) => (
                <Select
                  id={c.id}
                  aria-describedby={c.describedBy}
                  options={campuses.map((option) => ({ value: option.slug, label: option.name }))}
                  value={campus?.slug ?? ''}
                  onChange={(e) =>
                    setParams(
                      (current) => {
                        const next = new URLSearchParams(current)
                        next.set('campus', e.target.value)
                        next.delete('edificio')
                        next.delete('espacio')
                        return next
                      },
                      { replace: true },
                    )
                  }
                />
              )}
            </Field>

            <Field label="Edificio" error={errors.buildingId}>
              {(c) => (
                <Select
                  id={c.id}
                  aria-describedby={c.describedBy}
                  invalid={c.invalid}
                  placeholder="Elige un edificio"
                  options={options.buildings.map((b) => ({ value: b.id, label: b.name }))}
                  value={values.buildingId}
                  onChange={(e) => set('buildingId', e.target.value)}
                />
              )}
            </Field>

            <Field label="Espacio" error={errors.spaceId}>
              {(c) => (
                <Select
                  id={c.id}
                  aria-describedby={c.describedBy}
                  invalid={c.invalid}
                  placeholder="Elige un espacio"
                  options={spaces.map((s) => ({ value: s.id, label: s.name }))}
                  disabled={!values.buildingId}
                  value={values.spaceId}
                  onChange={(e) => set('spaceId', e.target.value)}
                />
              )}
            </Field>

            <Field label="Categoría" error={errors.categoryId}>
              {(c) => (
                <Select
                  id={c.id}
                  aria-describedby={c.describedBy}
                  invalid={c.invalid}
                  placeholder="Elige una categoría"
                  options={options.categories.map((cat) => ({ value: cat.id, label: cat.name }))}
                  value={values.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field
            label="Descripción"
            error={errors.description}
            hint={
              errors.description ? undefined : `${formatNumber(length)} / ${formatNumber(MAX_DESCRIPTION)}`
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
                className="lg:min-h-48"
                value={values.description}
                onChange={(e) => set('description', e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <PhotoPicker photos={photos} onChange={setPhotos} />

          <div className="hidden rounded-control bg-green-surface p-3 text-body text-green-dark lg:block">
            Antes de enviar revisaremos si ya existe un reporte parecido, para que lo confirmes en
            vez de duplicarlo.
          </div>

          {banner?.tone === 'error' && (
            <Notice tone="error" className="text-body">
              {banner.text}
            </Notice>
          )}

          {/* SDD 13.3: the reporter's email is visible to the staff (RN-04). */}
          <p className="text-xs text-neutral-text-muted">
            Tu correo será visible para el personal que atiende el reporte.
          </p>
          <Button type="submit" disabled={busy || !campus} className="mt-1">
            {busy ? 'Enviando…' : 'Enviar reporte'}
          </Button>
        </div>
      </form>
    </>
  )
}
