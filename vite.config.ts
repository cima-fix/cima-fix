import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Plugins are Vite extras: react handles JSX, tailwind generates the styles.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
