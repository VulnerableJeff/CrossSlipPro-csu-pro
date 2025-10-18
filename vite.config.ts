import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TODO: change to your actual repo name
const REPO = process.env.VITE_REPO_NAME || 'slipscan';

export default defineConfig({
  plugins: [react()],
  base: `/${REPO}/`,
})