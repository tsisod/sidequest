import 'vite/client'

declare global {
  interface ViteTypeOptions {
    strictImportMetaEnv: unknown
  }

  interface ImportMetaEnv {
    readonly VITE_CONVEX_URL?: string
  }
}
