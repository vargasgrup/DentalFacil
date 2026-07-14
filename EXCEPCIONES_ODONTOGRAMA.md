# Excepciones — Odontograma / Periodontograma

Según `PROMPT_FIX_CRITICOS_DENTALSIMPLE.md`, estos archivos **no se modificaron** aunque usan acceso directo a `localStorage` para el token.

| Ruta | Motivo |
|------|--------|
| `frontend/src/components/odontogram/ToothAttachments.tsx` (líneas ~23 y ~112) | Usa `localStorage.getItem("access_token")` al descargar/previsualizar adjuntos de diente. Pertenece al módulo odontograma cerrado; unificar a `getToken()` queda fuera del alcance de este prompt. |
