# Generador de actas GeoVictoria

Aplicación web para el equipo de GeoVictoria. Cualquier persona con correo @geovictoria.com entra con su cuenta de Microsoft, sin necesitar cuenta de Claude. Ve sus reuniones de Samu.ai, genera el acta en formato GeoVictoria, la descarga en Word o PDF y crea las tareas en Zoho CRM.

**Para publicarla:** ver [DESPLIEGUE.md](DESPLIEGUE.md).

## Formato del acta
Encabezado (tipo de acta, título "Tema – Cliente", país y fecha), líneas amarilla y cian, objetivo de la sesión, asistentes del cliente y de GeoVictoria ("Nombre – Rol"), temas tratados y tabla de acuerdos (Compromiso / Responsable / Fecha). Nunito: cuerpo 10 pt, título 12 pt, etiquetas 8–8,5 pt. El rol de cuenta siempre se escribe **KAM**, nunca CAM.

## Probarlo en 1 minuto (sin credenciales)

```bash
npm install
cp .env.example .env.local
# en .env.local: NEXTAUTH_SECRET=<cualquier texto largo>, DEV_LOGIN=true, SAMU_MOCK=true, ZOHO_DRY_RUN=true
npm run dev   # http://localhost:3000
```

Ingresa con cualquier correo del dominio autorizado. Verás reuniones ficticias, un borrador de acta de demostración (con una tarea inventada a propósito para ver el verificador en acción), exportación real a Word/PDF y la matriz de Zoho en modo simulado.

## Cómo cumple cada punto de la especificación

| Requisito | Dónde |
|---|---|
| SSO obligatorio (Microsoft Entra ID o Google Workspace) | `src/lib/auth.ts` |
| Solo dominio autorizado — validado en el login, en el middleware y en cada API | `src/lib/config.ts`, `src/middleware.ts`, `requireUser()` |
| Nombre y correo de la sesión → personalización y responsables | `src/lib/auth.ts`, `TopBar`, `ActaEditor` |
| Paleta, tipografía Nunito | `src/app/globals.css` (tokens en `:root`) |
| Pop-up de bienvenida con frase aleatoria, una vez por inicio de sesión | `src/components/WelcomeModal.tsx`, `src/lib/phrases.ts` |
| Listado de reuniones de Samu.ai del usuario, sincronizado (cada 60 s y al volver a la pestaña) | `src/components/Dashboard.tsx`, `src/lib/integrations/samu.ts` |
| Tarjeta: cliente, fecha/hora, asistentes, botón **Generar Acta** | `MeetingCard` en `Dashboard.tsx` |
| Procesamiento IA con reglas anti-alucinación | `src/lib/acta/prompt.ts`, `generate.ts`, `validate.ts` |
| Estructura estándar del acta en Nunito 10 pt | vista: `.acta` en CSS · Word: `export/docx.ts` · PDF: `export/pdf.ts` |
| Descarga Word y PDF | `src/app/api/actas/export` |
| Matriz de tareas para API + creación en Zoho CRM | `src/lib/integrations/zoho.ts`, `src/app/api/crm/tasks` |

## Anti-alucinación: tres capas

1. **Prompt** (`prompt.ts`): reglas explícitas de fidelidad, temperatura 0 y salida forzada por herramienta (`schema.ts`), validada con zod.
2. **Evidencia obligatoria**: cada punto del resumen y cada tarea trae una cita textual de la transcripción.
3. **Verificador determinístico** (`validate.ts`, con tests): sin IA, comprueba que
   - la cita exista en la transcripción (exacta o ≥ 85 % de palabras en orden dentro del mismo turno),
   - el responsable sea un participante real — si no, queda "Por definir",
   - la fecha de entrega se haya mencionado — si no, se elimina.

   Lo que no pasa se resalta en amarillo para revisión humana, y **no se puede enviar al CRM** hasta marcarlo como revisado.

```bash
npm test   # pruebas del verificador (citas, responsables, fechas, roles, KAM)
```

## Reglas de asignación en Zoho CRM

- Responsable de GeoVictoria con usuario activo en Zoho → la tarea queda a su nombre.
- Responsable del cliente o "Por definir" → la tarea queda a nombre de quien generó el acta (hace el seguimiento); el responsable real va en la descripción.
- `Due_Date` solo si la reunión fijó una fecha. Nunca se inventa.
- Cada tarea lleva la referencia `GV-ACTA {reunión}:{tarea}`; si ya existe en Zoho, no se duplica.
- La tarea se relaciona con la cuenta (Accounts) cuyo nombre coincide con el cliente, si existe.

Formato de la matriz (`POST /api/crm/tasks` con `preview: true` la devuelve sin enviar):

```json
{
  "externalId": "65a1f0c2b3d4e5f6a7b8c9d0:T2",
  "subject": "Agendar visita técnica a la bodega de Quilicura",
  "description": "Compromiso del acta… Responsable acordado: … Respaldo en la reunión: \"…\"",
  "status": "Not Started",
  "dueDate": "2026-11-20",
  "ownerEmail": "persona@geovictoria.com",
  "responsableNombre": "Persona",
  "responsableEsCliente": false,
  "accountName": "Logística Andina S.A."
}
```

## Pendientes antes de producción

Todo está en [DESPLIEGUE.md](DESPLIEGUE.md). Lo principal es confirmar en `https://api.samu.ai/docs` las rutas y parámetros de la API de Samu (variables `SAMU_PATH_*` y `SAMU_PARAM_*`) y conseguir las claves de Microsoft, Anthropic, Samu y Zoho.

## Estructura

```
src/
  app/
    login/                     inicio de sesión SSO
    page.tsx                   panel principal + pop-up
    acta/[meetingId]/          editor del acta
    api/meetings               reuniones del usuario (Samu.ai)
    api/actas/generate         transcripción → acta verificada
    api/actas/export           acta → .docx / .pdf
    api/crm/tasks              matriz → Zoho CRM
  components/                  Dashboard, WelcomeModal, ActaEditor, TopBar, Icons
  lib/
    auth.ts, config.ts, session.ts
    acta/                      prompt, esquema, generación, verificador (+ tests)
    export/                    docx.ts, pdf.ts, brand.ts
    integrations/              samu.ts (+ mock), zoho.ts
public/fonts, public/brand     Nunito y logotipo (se incrustan en Word y PDF)
```
