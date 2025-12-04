import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/emoji-crypto-chat/',
  root: path.resolve(__dirname, '.'),
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
