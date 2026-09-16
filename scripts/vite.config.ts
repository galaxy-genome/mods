import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  root: path.resolve(import.meta.dirname, '../src'),
  publicDir: path.resolve(import.meta.dirname, '../public'),
  build: { outDir: path.resolve(import.meta.dirname, '../dist'), emptyOutDir: true },
  base: command === 'build' ? '/mods/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
  server: { host: true, port: 8795 },
}))
