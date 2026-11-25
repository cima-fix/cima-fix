import { createBrowserRouter, type LoaderFunctionArgs } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import { RouteError } from './components/layout/RouteError'
import { signInAction, signInLoader, signOutAction, spaceLinkLoader } from './features/access/data'
import { SignInPage } from './features/access/SignInPage'
import {
  catalogAction,
  catalogLoader,
  settingsAction,
  settingsLoader,
  staffAction,
  staffLoader,
} from './features/admin/data'
import { homeLoader } from './features/home/data'
import { HomePage } from './features/home/HomePage'
import { buildingReportsLoader, mapLoader, shouldRevalidateMap } from './features/map/data'
import { reportFormLoader } from './features/report-form/data'
import { ReportFormPage } from './features/report-form/ReportFormPage'
import { AssignSheet } from './features/reports/AssignSheet'
import { reportAction, reportDetailLoader, reportListLoader } from './features/reports/data'
import { ReportDetailPage } from './features/reports/ReportDetailPage'
import { ReportListPage } from './features/reports/ReportListPage'
import { withSignIn } from './lib/api-errors'
import { loadSession, shellLoader } from './lib/session'

// Every loader inside the shell waits for the session too (the same request as the shell's,
// lib/session.ts): loaders run in parallel, so a screen must not load its data before the shell
// has had the chance to send the account to /ingresar.
function withSession<T>(loader: (args: LoaderFunctionArgs) => T | Promise<T>) {
  return withSignIn(async (args: LoaderFunctionArgs) => {
    await loadSession(args.request)
    return loader(args)
  })
}

// Routes follow SDD 13.2.
export const router = createBrowserRouter([
  {
    path: 'ingresar',
    loader: signInLoader,
    action: signInAction,
    element: <SignInPage />,
    errorElement: <RouteError />,
  },
  { path: 'salir', action: signOutAction, errorElement: <RouteError /> },
  {
    id: 'shell',
    loader: shellLoader,
    element: <AppShell />,
    errorElement: <RouteError />,
    // Shown while the first route's loader runs.
    hydrateFallbackElement: (
      <p role="status" className="p-6 text-center text-body text-neutral-text-muted">
        Cargando…
      </p>
    ),
    children: [
      { index: true, loader: withSession(homeLoader), element: <HomePage /> },
      { path: 'e/:code', loader: spaceLinkLoader },
      { path: 'reportar', loader: reportFormLoader, element: <ReportFormPage /> },
      { path: 'reportes', loader: withSession(reportListLoader), element: <ReportListPage /> },
      {
        id: 'report',
        path: 'reportes/:id',
        loader: withSession(reportDetailLoader),
        action: reportAction,
        element: <ReportDetailPage />,
        children: [{ path: 'asignar', action: reportAction, element: <AssignSheet /> }],
      },
      {
        id: 'map',
        path: 'mapa',
        loader: mapLoader,
        shouldRevalidate: shouldRevalidateMap,
        // Leaflet only loads when the map opens.
        lazy: async () => ({ Component: (await import('./features/map/MapPage')).MapPage }),
        children: [
          {
            path: 'edificios/:buildingId',
            loader: buildingReportsLoader,
            lazy: async () => ({ Component: (await import('./features/map/MapPage')).BuildingReports }),
          },
        ],
      },
      {
        path: 'campus/:slug/catalogo',
        loader: catalogLoader,
        action: catalogAction,
        // The management screens load only when opened: most accounts never do.
        lazy: async () => ({ Component: (await import('./features/admin/CatalogPage')).CatalogPage }),
      },
      {
        path: 'campus/:slug/personal',
        loader: staffLoader,
        action: staffAction,
        lazy: async () => ({ Component: (await import('./features/admin/StaffPage')).StaffPage }),
      },
      {
        path: 'campus/:slug/configuracion',
        loader: settingsLoader,
        action: settingsAction,
        lazy: async () => ({ Component: (await import('./features/admin/SettingsPage')).SettingsPage }),
      },
    ],
  },
])
