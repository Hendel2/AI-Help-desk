/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const DEFAULT_PROXY_TARGET = 'http://localhost:8000'

// O .env real do monorepo fica na raiz do repositório (ver CLAUDE.md).
// Apenas variáveis com prefixo VITE_ chegam ao bundle; variáveis já definidas
// no ambiente do processo (ex.: docker-compose) têm precedência sobre o arquivo.
const envDir = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, 'VITE_')
  const proxyTarget = env.VITE_PROXY_TARGET || DEFAULT_PROXY_TARGET

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    // Pré-empacota dependências usadas só em telas carregadas sob demanda: sem
    // isso o Vite as descobre no meio da sessão e recarrega a página inteira.
    optimizeDeps: {
      include: ['react-hook-form', 'zod', '@hookform/resolvers/zod'],
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
    },
  }
})
