import { useEffect, useId, useRef } from 'react'
import { cn } from '../../lib/cn'
import { FileIcon, PlusIcon } from '../../components/ui/icons'

export const MAX_PHOTOS = 3
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i

export type Photo = { key: string; file: File; url?: string; error?: string }

const slot =
  'flex size-15 cursor-pointer items-center justify-center rounded-control border border-dashed border-neutral-field-border text-neutral-text-secondary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-green'

// RF-REPORTE-03/04: up to 3 photos, 10 MB each, JPG, PNG, WebP or HEIC.
function toPhoto(file: File): Photo {
  const key = crypto.randomUUID()
  const isImage = ACCEPTED.includes(file.type) || ACCEPTED_EXTENSIONS.test(file.name)
  if (!isImage) {
    return { key, file, error: `${file.name} no es una imagen. Usa JPG, PNG, WebP o HEIC.` }
  }
  if (file.size > MAX_BYTES) {
    return { key, file, error: `${file.name} pesa más de 10 MB. Elige una foto más ligera.` }
  }
  return { key, file, url: URL.createObjectURL(file) }
}

type PhotoPickerProps = {
  photos: Photo[]
  onChange: (photos: Photo[]) => void
}

export function PhotoPicker({ photos, onChange }: PhotoPickerProps) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const latest = useRef(photos)

  useEffect(() => {
    latest.current = photos
  }, [photos])

  // Release preview URLs when the picker goes away.
  useEffect(
    () => () => latest.current.forEach((p) => p.url && URL.revokeObjectURL(p.url)),
    [],
  )

  const errors = photos.flatMap((p) => (p.error ? [p.error] : []))

  function add(files: FileList | null) {
    if (!files) return
    const room = MAX_PHOTOS - photos.length
    onChange([...photos, ...Array.from(files).slice(0, room).map(toPhoto)])
  }

  function remove(photo: Photo) {
    if (photo.url) URL.revokeObjectURL(photo.url)
    onChange(photos.filter((p) => p.key !== photo.key))
  }

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-body text-neutral-text-secondary">
        Fotografías (opcional)
      </legend>
      <div className="flex gap-2.5">
        {photos.map((photo) => (
          <button
            key={photo.key}
            type="button"
            onClick={() => remove(photo)}
            aria-label={`Quitar ${photo.file.name}`}
            className={cn(
              'flex size-15 items-center justify-center overflow-hidden rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green',
              photo.error
                ? 'border-2 border-status-error text-status-error'
                : 'border border-neutral-border',
            )}
          >
            {photo.url ? (
              <img src={photo.url} alt="" className="size-full object-cover" />
            ) : (
              <FileIcon className="size-6" />
            )}
          </button>
        ))}
        {/* One dashed slot per free photo, as in Figma; all of them open the same input. */}
        {Array.from({ length: Math.max(MAX_PHOTOS - photos.length - 1, 0) }, (_, i) => (
          <label key={i} htmlFor={inputId} aria-hidden="true" className={cn(slot, 'order-last')}>
            <PlusIcon className="size-6" />
          </label>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label htmlFor={inputId} className={slot}>
            <PlusIcon className="size-6" />
            <span className="sr-only">Agregar foto</span>
            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,.heic"
              multiple
              aria-describedby={[errors.length ? errorId : '', hintId].join(' ').trim()}
              className="sr-only"
              onChange={(event) => {
                add(event.target.files)
                event.target.value = ''
              }}
            />
          </label>
        )}
      </div>
      {errors.length > 0 && (
        <div id={errorId}>
          {errors.map((error) => (
            <p key={error} className="text-xs text-status-error">
              {error}
            </p>
          ))}
        </div>
      )}
      <p id={hintId} className="text-xs text-neutral-text-muted">
        Hasta 3 fotos, 10 MB cada una. JPG, PNG, WebP o HEIC.
      </p>
    </fieldset>
  )
}
