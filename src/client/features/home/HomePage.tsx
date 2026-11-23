import { ScreenHeader } from '../../components/layout/ScreenHeader'
import { ButtonLink } from '../../components/ui/Button'

// / — entry point to reporting, the report list and the map (SDD 13.2).
// Not in Figma yet: built only from existing components until it is designed.
export function HomePage() {
  return (
    <>
      <ScreenHeader title="Cima Fix" />
      <div className="flex flex-col gap-3 px-4 py-6">
        <p className="text-body text-neutral-text-secondary">
          Reporta un problema del campus o revisa en qué va.
        </p>
        <ButtonLink to="/reportar">Reportar un problema</ButtonLink>
        <ButtonLink to="/reportes" variant="secondary">
          Ver reportes
        </ButtonLink>
        <ButtonLink to="/mapa" variant="secondary">
          Ver mapa del campus
        </ButtonLink>
      </div>
    </>
  )
}
