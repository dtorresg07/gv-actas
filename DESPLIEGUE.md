# Guía de despliegue para TI — Generador de actas GeoVictoria

**Qué es:** una aplicación web (Next.js 14) donde cualquier persona con correo **@geovictoria.com** entra con un código de 6 dígitos que le llega a ese correo (o, si TI lo configura, con su cuenta de Microsoft). Ve sus reuniones grabadas en Samu.ai, genera el acta con IA, la descarga en Word o PDF y crea las tareas en Zoho CRM. **No se necesita cuenta de Claude.**

**Quién ve qué:** la app usa **una sola clave de Samu de la empresa**, pero el servidor filtra por el correo de quien inició sesión. Cada persona solo ve las reuniones donde participó. Las actas no se guardan en el servidor: se generan, se editan en el navegador y se descargan.

---

## 1. Lo que hay que conseguir (una sola vez)

| # | Qué | Dónde | Quién suele tenerlo |
|---|---|---|---|
| 1 | Registro de aplicación en **Microsoft Entra ID** | portal.azure.com | Admin de Microsoft 365 |
| 2 | **Clave de API de Anthropic** (la IA) | console.anthropic.com → API Keys | Quien administre la facturación |
| 3 | **Clave de API de Samu.ai** (plan Enterprise) | Samu.ai → configuración de la cuenta; documentación en `https://api.samu.ai/docs` | Admin de Samu / contacto comercial de Samu |
| 4 | **Cliente de Zoho CRM** con refresh token | api-console.zoho.com → Self Client | Admin de Zoho |
| 5 | Un lugar donde publicarla, con HTTPS | Vercel, Azure App Service o un servidor con Node 20 | TI |

### 1.0 Correo que envía los códigos (lo puede hacer cualquiera, sin TI)
1. Crea una cuenta de Gmail para la herramienta (ej. `actas.geovictoria@gmail.com`).
2. En myaccount.google.com → **Seguridad** → activa **Verificación en 2 pasos**.
3. En myaccount.google.com/apppasswords crea una contraseña de aplicación llamada `Generador de actas`. Google muestra 16 letras.
4. En Vercel → Settings → Environment Variables agrega `SMTP_USER` (el Gmail) y `SMTP_PASS` (las 16 letras, sin espacios) y haz **Redeploy**.

Cada código vence en 10 minutos, sirve una sola vez y se bloquea tras 5 intentos fallidos.

### 1.1 (Opcional) Microsoft Entra ID
1. Entra ID → *App registrations* → *New registration*.
2. Nombre: `Generador de actas`. Tipo de cuenta: **solo este directorio (single tenant)**.
3. Redirect URI (Web): `https://<tu-dominio>/api/auth/callback/azure-ad`.
4. *Certificates & secrets* → nuevo *client secret*.
5. Copia **Application (client) ID**, **Directory (tenant) ID** y el **secret** en `AZURE_AD_CLIENT_ID`, `AZURE_AD_TENANT_ID` y `AZURE_AD_CLIENT_SECRET`.

Además del tenant único, la app rechaza cualquier correo que no termine en un dominio de `ALLOWED_EMAIL_DOMAINS`. Lo valida al iniciar sesión, en cada página y en cada llamada al servidor.

### 1.2 Anthropic
Crea una clave en console.anthropic.com y ponla en `ANTHROPIC_API_KEY`. El modelo por defecto es `claude-sonnet-5-5`. Cada acta consume aproximadamente lo que ocupa la transcripción (una reunión de 1 hora ≈ 15–25 mil tokens de entrada).

### 1.3 Samu.ai — **revisar antes de publicar**
La API REST de Samu se autentica con el encabezado `apiKey` y viene con el plan Enterprise. Desde aquí no se pudieron confirmar las rutas exactas, así que quedaron configurables:

| Variable | Valor por defecto | Qué es |
|---|---|---|
| `SAMU_PATH_MEETINGS` | `/v1/meetings` | Listado de reuniones |
| `SAMU_PATH_TRANSCRIPT` | `/v1/meetings/{id}/transcription` | Transcripción de una reunión |
| `SAMU_PARAM_EMAIL` | `attendeeEmails` | Filtro por correo de participante |
| `SAMU_PARAM_FROM` / `_TO` | `from` / `to` | Rango de fechas (AAAA-MM-DD) |
| `SAMU_PARAM_LIMIT` / `_OFFSET` | `limit` / `offset` | Paginación |

Abre `https://api.samu.ai/docs`, compara y ajusta las variables si los nombres difieren. La app ya entiende los campos que entrega Samu: `meetingId`, `name`, `date`, `duration`, `host`, `callType`, `platform`, `participantEmails`, `speakers[{name,type}]`, y transcripción en bloques `"[HH:MM:SS] nombre: texto"` con `hasMore`/`nextCursor`.

Prueba rápida, reemplazando la ruta si corresponde:
```bash
curl -H "apiKey: $SAMU_API_KEY" "https://api.samu.ai/v1/meetings?attendeeEmails=alguien@geovictoria.com&limit=1"
```

### 1.4 Zoho CRM
1. api-console.zoho.com → *Self Client* → genera un código con los scopes
   `ZohoCRM.modules.tasks.CREATE,ZohoCRM.modules.tasks.READ,ZohoCRM.modules.accounts.READ,ZohoCRM.users.READ`.
2. Cámbialo por un **refresh token** y llena `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` y `ZOHO_REFRESH_TOKEN`.
3. Si la cuenta de Zoho no está en el centro de datos de EE. UU., ajusta `ZOHO_ACCOUNTS_URL` y `ZOHO_API_DOMAIN`.

Las tareas se crean con ese usuario técnico. El *Owner* queda en el responsable de GeoVictoria, si existe en Zoho. Cada tarea lleva la referencia `GV-ACTA` para no duplicarse si alguien vuelve a enviarla.

---

## 2. Publicar

### Opción A — Vercel (la más simple)
1. Sube el proyecto a un repositorio privado de GitHub de GeoVictoria.
2. En vercel.com → *Add New Project* → importa el repositorio.
3. En *Environment Variables* copia todas las de `.env.example` con sus valores reales.
4. *Deploy*. Agrega el dominio (ej. `actas.geovictoria.com`) y actualiza `NEXTAUTH_URL` y el Redirect URI de Entra ID.

La generación del acta puede tardar 30–90 s. En Vercel eso requiere el plan **Pro** (el plan gratuito corta a los 60 s).

### Opción B — Azure App Service u otro servidor
```bash
npm ci
npm run build
npm start            # escucha en el puerto 3000 (PORT para cambiarlo)
```
Requiere Node 20 o superior y las variables de entorno configuradas. Pon un proxy con HTTPS delante. También se incluye un `Dockerfile`.

---

## 3. Prueba antes de anunciarla
1. **Modo ensayo:** con `SAMU_MOCK=true` y `ZOHO_DRY_RUN=true` todo funciona con datos de ejemplo. Sirve para validar el login y las descargas.
2. Cambia a `SAMU_MOCK=false` y entra con tu cuenta: deben aparecer tus reuniones de los últimos 30 días.
3. Genera un acta real, descarga Word y PDF, y usa **Ver matriz** para revisar las tareas.
4. Cambia `ZOHO_DRY_RUN=false` y envía **una** tarea de prueba a Zoho.
5. Entra con un correo que no sea de GeoVictoria: debe ser rechazado.

## 4. Mantenimiento
- `npm test` corre las pruebas del verificador anti-alucinación.
- Las claves solo viven en las variables de entorno del servidor; nunca llegan al navegador.
- Rota `NEXTAUTH_SECRET` y el secret de Entra ID según la política de TI.
