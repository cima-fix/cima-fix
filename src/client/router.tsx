import { createBrowserRouter } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import { HomePage } from './features/home/HomePage'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [{ index: true, element: <HomePage /> }],
  },
])