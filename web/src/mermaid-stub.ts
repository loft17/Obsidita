// Sustituye al paquete 'mermaid' en el build cuando los diagramas están desactivados
// (ver vite.config.ts). Nunca se usa en ejecución: con __MERMAID__ en false no se llama a mermaid
export default {} as Record<string, never>;
