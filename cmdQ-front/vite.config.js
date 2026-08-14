import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    open: false,
    cors: true,
    proxy: {
      '/ai': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
