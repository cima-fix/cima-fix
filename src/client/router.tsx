import { createBrowserRouter } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import { RouteError } from './components/layout/RouteError'
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

// Routes follow SDD 13.2.
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    // Shown while the first route's loader runs.
    hydrateFallbackElement: (
      <p role="status" className="p-6 text-center text-body text-neutral-text-muted">
        Cargando…
      </p>
    ),
    children: [
      { index: true, loader: homeLoader, element: <HomePage /> },
      { path: 'reportar', loader: getCatalog, element: <ReportFormPage /> },
      { path: 'reportes', loader: reportListLoader, element: <ReportListPage /> },
      {
        id: 'report',
        path: 'reportes/:id',
        loader: reportDetailLoader,
        action: reportAction,
        element: <ReportDetailPage />,
        children: [{ path: 'asignar', action: reportAction, element: <AssignSheet /> }],
      },
      { path: 'mapa', loader: mapLoader, element: <MapPage /> },
    ],
  },
])
