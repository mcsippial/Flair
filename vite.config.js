import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Flair/',
  resolve: {
    alias: {
      tone: path.resolve('./src/tone-shim.js'),
    },
  },
  build: {
    rollupOptions: {
      external: [/^node:/],
    },
  },
})
