# Sistema Universal de Envío de Documentos (WhatsApp)

Flujo **nativo** (regla única del proyecto).

## Al hacer clic en Enviar

```
PDF (RAM)
  → Cloud API /share + reintentos     (solo si está configurada)
  → navigator.share({ files })        (Chrome/Edge con Web Share)
  → WhatsApp Desktop + WhatsApp Web   (chat del paciente + PDF descargado)
```

1. **Cloud API** — opcional; Meta Graph solo en servidor.
2. **Web Share** — selector nativo con archivo adjunto.
3. **WhatsApp app** — sin Cloud API: PDF **en RAM** (portapapeles / Web Share), abre el chat del paciente
   (`whatsapp://` + `web.whatsapp.com/send`). **No** dispara «Guardar como». Pegar con Ctrl+V en el chat.

El teléfono se toma **siempre** de la ficha del paciente (no se digita a mano).

## Uso

```tsx
<DocumentActions
  documentType="comprobante"
  downloadUrl={`/api/documents/comprobante/${id}`}
  telefono={paciente.telefono}
  mensaje={mensaje}
/>
```

## Resultado

| Campo | Cloud OK | Web Share | Desktop/Web |
|-------|----------|-----------|-------------|
| `success` | `true` | `true` | `true` |
| `strategy` | `cloud_api` / `cloud_api_retry` | `web_share` | `whatsapp_app` |
| `cloud_api_sent` | `true` | `false` | `false` |

## Regla Cursor

`.cursor/rules/document-whatsapp-sender.mdc` (`alwaysApply: true`).
