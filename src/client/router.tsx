import { createBrowserRouter, type LoaderFunctionArgs } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import { RouteError } from './components/layout/RouteError'
import { signInAction, signInLoader, signOutAction, spaceLinkLoader } from './features/access/data'
import { SignInPage } from './features/access/SignInPage'
import { CatalogPage } from './features/admin/CatalogPage'
import {
  catalogAction,
  catalogLoader,
  settingsAction,
  settingsLoader,
  staffAction,
  staffLoader,
} from './features/admin/data'
import { SettingsPage } from './features/admin/SettingsPage'
import { StaffPage } from './features/admin/StaffPage'
import { homeLoader } from './features/home/data'
import { HomePage } from './features/home/HomePage'
import { mapLoader } from './features/map/data'
import { MapPage } from './features/map/MapPage'
import { ReportFormPage } from './features/report-form/ReportFormPage'
import { AssignSheet } from './features/reports/AssignSheet'
import { reportAction, reportDetailLoader, reportListLoader } from './features/reports/data'
import { ReportDetailPage } from './features/reports/ReportDetailPage'
import { ReportListPage } from './features/reports/ReportListPage'
import { getCatalog } from './lib/demo-api'
import { requireSession, shellLoader } from './lib/session'

// Every loader inside the shell checks the session itself too: loaders run in parallel, so
// a screen must not load its data before the shell has had the chance to redirect.
function withSession<T>(loader: (args: LoaderFunctionArgs) => T) {
  return (args: LoaderFunctionArgs) => {
    requireSession(args.request)
    return loader(args)
  }
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
      { path: 'reportar', loader: withSession(getCatalog), element: <ReportFormPage /> },
      { path: 'reportes', loader: withSession(reportListLoader), element: <ReportListPage /> },
      {
        id: 'report',
        path: 'reportes/:id',
        loader: withSession(reportDetailLoader),
        action: reportAction,
        element: <ReportDetailPage />,
        children: [{ path: 'asignar', action: reportAction, element: <AssignSheet /> }],
      },
      { path: 'mapa', loader: withSession(mapLoader), element: <MapPage /> },
      {
        path: 'campus/:slug/catalogo',
        loader: catalogLoader,
        action: catalogAction,
        element: <CatalogPage />,
      },
      { path: 'campus/:slug/personal', loader: staffLoader, action: staffAction, element: <StaffPage /> },
      {
        path: 'campus/:slug/configuracion',
        loader: settingsLoader,
        action: settingsAction,
        element: <SettingsPage />,
      },
    ],
  },
])
