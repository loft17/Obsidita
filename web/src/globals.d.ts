/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

// Módulos internos de mermaid con los diagramas (no tienen tipos: los usa mermaidDiagrams.ts
// para registrar solo los que conocemos y descargar cada uno cuando aparece)
declare module 'mermaid/dist/chunks/mermaid.core/*.mjs' {
  export const diagram: unknown;
}
