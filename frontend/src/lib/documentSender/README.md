# Sistema Universal de Envío de Documentos (WhatsApp)

Arquitectura adaptada al stack **Next.js + FastAPI** (no Node/Express del brief original).

## Flujo

```
PDF (RAM) → Cloud API (backend) → reintentos → Web Share API → descarga + wa.me
```

1. **Cloud API** — el frontend sube el PDF al backend; Meta Graph se llama solo en servidor.
2. **Reintentos** — hasta 3 con delay exponencial (`/send-document`).
3. **Web Share** — `navigator.share({ files })` (móvil / Chromium).
4. **Fallback** — descarga del PDF + apertura de `wa.me` para adjuntar a mano.

Sin `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`, se salta Cloud API automáticamente.

## Uso rápido

```tsx
import { ShareDocumentButton } from "@/components/ShareDocumentButton";

<ShareDocumentButton
  documentType="comprobante"
  downloadUrl={`/api/documents/comprobante/${id}`}
  fileName={`comprobante-${id}.pdf`}
  message={`Comprobante de pago #${id}`}
  phoneNumber={paciente.telefono}
/>
```

O con el hook:

```tsx
const { sendDocument, isSending } = useDocumentSender();
await sendDocument({ downloadUrl, phoneNumber, message, documentType: "reporte" });
```

`DocumentActions` ya usa este sistema en Caja, Ficha, Reportes, etc.

## Backend

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/integrations/whatsapp/status` | ¿Cloud API configurada? |
| `POST /api/integrations/whatsapp/share` | Envío (multipart PDF) |
| `POST /api/integrations/whatsapp/send-document` | Reintento |
| `POST /api/integrations/whatsapp/metrics` | Métricas de fallback |

Variables (ver `backend/.env.example`):

```
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_API_VERSION=v17.0
```

## Archivos

| Ruta | Rol |
|------|-----|
| `frontend/src/lib/documentSender/` | Servicio, errores, caché LRU, toasts |
| `frontend/src/hooks/useDocumentSender.ts` | Hook |
| `frontend/src/components/ShareDocumentButton.tsx` | Botón reutilizable |
| `frontend/src/components/DocumentSendToast.tsx` | Feedback visual |
| `backend/app/services/whatsapp_cloud.py` | Meta Graph |
| `backend/app/routers/whatsapp_integration.py` | Endpoints |

## Notas

- El PDF se genera en el backend en memoria (ReportLab) y el cliente lo mantiene como `Blob` (caché LRU máx. 50).
- Cloud API exige cuenta WhatsApp Business y ventana de mensajería / plantillas según políticas de Meta.
- En escritorio Windows, el fallback descarga + `wa.me` sigue siendo el camino más frecuente si Cloud API no está activa.
