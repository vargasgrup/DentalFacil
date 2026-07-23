# Sistema Universal de Envío de Documentos (WhatsApp)

Flujo **nativo** (regla única del proyecto).

## Al hacer clic en Enviar

```
PDF (RAM)
  → POST /api/integrations/whatsapp/share     → cloud_api_sent: true
  → POST /api/integrations/whatsapp/send-document  (reintentos)
  → navigator.share({ files })               → selector SO → WhatsApp
```

1. **Cloud API** — multipart PDF al backend; Meta Graph solo en servidor. Un clic.
2. **Reintentos** — `/send-document` hasta 3 veces.
3. **Web Share** — selector nativo con archivo adjunto (**sin** modal de arrastre / `wa.me`).

Sin `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`, se salta a Web Share automáticamente.

## Uso

```tsx
import { ShareDocumentButton } from "@/components/ShareDocumentButton";
import { DocumentActions } from "@/components/DocumentActions";

<DocumentActions
  documentType="comprobante"
  downloadUrl={`/api/documents/comprobante/${id}`}
  telefono={paciente.telefono}
  mensaje={mensaje}
/>

<ShareDocumentButton
  documentType="presupuesto"
  downloadUrl={url}
  phoneNumber={paciente.telefono}
  message={mensaje}
/>
```

## Resultado

| Campo | Cloud OK | Web Share |
|-------|----------|-----------|
| `success` | `true` | `true` |
| `strategy` | `cloud_api` / `cloud_api_retry` | `web_share` |
| `cloud_api_sent` | `true` | `false` |

## Regla Cursor

`.cursor/rules/document-whatsapp-sender.mdc` (`alwaysApply: true`).
