import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // API_TARGET lets a second dev setup point at another backend port
      '/api': process.env.API_TARGET || 'http://localhost:5000',
    },
  },
})
