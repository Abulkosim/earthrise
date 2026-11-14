import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// EARTHRISE_BASE is the path the site is served from ("/earthrise/" on GitHub Pages).
// VITE_DATA_BASE (read in src/engine/data.ts) is where the prepared NASA data lives.
export default defineConfig({
  base: process.env.EARTHRISE_BASE ?? '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: 'index.html', validation: 'validation.html', verify: 'verify.html' },
    },
  },
})
