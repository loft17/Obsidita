// Lenguajes que el editor reconoce en los bloques ```lang (resaltado y autocompletado).
// Va en su propio módulo, sin dependencias de React: `@codemirror/language-data` pesa ~39 kB y
// así lo carga el editor y no la pantalla principal, que lo necesita solo al abrir una nota.
// Cada lenguaje se descarga la primera vez que aparece un bloque que lo usa
export { languages } from '@codemirror/language-data';
