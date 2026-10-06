/// <reference types="vite/client" />

interface ViteTypeOptions {
  // Torna erro de tipo o acesso a variáveis de ambiente não declaradas abaixo.
  strictImportMetaEnv: unknown
}

/**
 * Variáveis expostas ao bundle (somente valores NÃO sensíveis).
 * VITE_PROXY_TARGET é lida apenas no vite.config.ts e não é usada no código do app.
 */
interface ImportMetaEnv {
  /** Base da API; padrão `/api/v1`. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
