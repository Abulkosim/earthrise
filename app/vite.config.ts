import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// EARTHRISE_BASE is the path the site is served from ("/earthrise/" on GitHub Pages).
// VITE_DATA_BASE (read in src/engine/data.ts) is where the prepared NASA data lives.
export default defineConfig({
  base: process.env.EARTHRISE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      input: { main: 'index.html', validation: 'validation.html', verify: 'verify.html' },
    },
  },
})
