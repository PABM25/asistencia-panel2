# Publicar la demo pública

Guía para dejar Pulso online como demo para mostrar a posibles clientes.
Costo: $0 (planes gratuitos de Supabase y Cloudflare). Tiempo: unos 30 minutos.

Al terminar tendrás:

- Una dirección como `https://pulso-demo.pages.dev` (o tu propio dominio).
- En la pantalla de inicio de sesión, un recuadro **"Prueba la demo"** con la
  cuenta de administrador y un código QR para abrir el kiosco en el teléfono.
- Los datos de ejemplo se **reinician solos cada noche** (04:00–05:00 en Chile),
  así que los visitantes pueden cambiar lo que quieran.
- Cada vez que hagas `git push`, la demo se actualiza sola.

> **Importante:** la demo usa un proyecto de Supabase **nuevo y separado**.
> Nunca uses tu proyecto real: el reinicio nocturno borra todos los datos.

---

## Parte 1 — Proyecto de Supabase para la demo

1. Entra en <https://supabase.com/dashboard> y pulsa **New project**.
   - Nombre: `pulso-demo`.
   - Región: **South America (São Paulo)**, la más cercana a Chile.
   - Contraseña de la base de datos: genera una y guárdala.
2. Cuando termine de crearse, abre **SQL Editor** y ejecuta, **uno por uno y en
   este orden**, el contenido de cada archivo (pega → **Run**):
   1. `supabase/migrations/20261019000000_esquema_inicial.sql`
   2. `supabase/migrations/20261019000001_registro_unico_y_admin.sql`
   3. `supabase/migrations/20261020000000_kiosco.sql`
   4. `supabase/migrations/20261021000000_reglas_asistencia.sql`
   5. `supabase/migrations/20261022000000_correcciones.sql`
   6. `supabase/datos_demo.sql`
3. Activa **pg_cron**: *Database → Extensions*, busca `pg_cron` y actívalo
   (en algunas versiones del panel está en *Integrations → Cron → Enable*).
4. Crea la **cuenta demo**: *Authentication → Users → Add user → Create new user*.
   - Email: `demo@pulso.cl` (o el que prefieras).
   - Contraseña: una fácil de escribir, por ejemplo `demo1234`. **Será pública.**
   - Marca **Auto Confirm User**.

   Como es el primer usuario del proyecto, queda como administrador.
5. Abre `supabase/demo/configurar_demo.sql`, cambia el email y la contraseña en
   la línea marcada con `← CAMBIA ESTOS DOS VALORES` (los mismos del paso 4),
   pégalo en el SQL Editor y pulsa **Run**. Al final debe mostrar:
   `empleados 12 · kiosco_demo 1 · cuenta_demo_admin 1`.
6. Cierra el registro de cuentas: *Authentication → Sign In / Providers* →
   desactiva **Allow new users to sign up** → **Save**.
7. Copia dos datos de *Project Settings → API* (los usarás en la parte 2):
   - **Project URL** (`https://xxxx.supabase.co`)
   - La clave **anon / publishable**.

No configures los avisos por email en la demo.

---

## Parte 2 — Publicar en Cloudflare Pages

1. Crea una cuenta gratuita en <https://dash.cloudflare.com/sign-up>.
2. En el menú, entra en **Workers & Pages** → **Create** → pestaña **Pages** →
   **Connect to Git** (o *Import an existing Git repository*).
3. Autoriza a Cloudflare a ver tu GitHub y elige el repositorio
   `asistencia-panel2`.
4. Configuración de compilación:
   - **Project name:** `pulso-demo` (será parte de la dirección).
   - **Production branch:** `master`.
   - **Framework preset:** None.
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. En **Environment variables** agrega estas seis:

   | Variable | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | el Project URL de la parte 1 |
   | `VITE_SUPABASE_ANON_KEY` | la clave anon / publishable |
   | `VITE_DEMO` | `true` |
   | `VITE_DEMO_EMAIL` | el email de la cuenta demo |
   | `VITE_DEMO_PASSWORD` | la contraseña de la cuenta demo |
   | `NODE_VERSION` | `22` |

6. Pulsa **Save and Deploy**. En 1–2 minutos tendrás la dirección
   `https://pulso-demo.pages.dev`.

> Si cambias una variable después, ve a *Deployments → … → Retry deployment*
> para que se aplique.

---

## Parte 3 — Conectar Supabase con la dirección de la demo

En el proyecto de Supabase de la demo: *Authentication → URL Configuration*:

- **Site URL:** `https://pulso-demo.pages.dev`
- **Redirect URLs:** agrega `https://pulso-demo.pages.dev/**`

---

## Parte 4 — Que la demo no se pause (GitHub)

El plan gratuito de Supabase pausa el proyecto si pasa 7 días sin uso. El
repositorio incluye una tarea de GitHub que lo consulta cada 3 días.

1. En GitHub, abre el repositorio → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**, y crea:
   - `DEMO_SUPABASE_URL` = el Project URL de la demo
   - `DEMO_SUPABASE_ANON_KEY` = la clave anon / publishable de la demo
2. Pruébala: pestaña **Actions** → **Mantener demo activa** → **Run workflow**.
   Debe terminar con ✓ verde.

GitHub desactiva las tareas programadas de un repositorio sin cambios durante
60 días; si te llega un email avisándolo, entra en *Actions* y reactívala.

---

## Parte 5 (opcional) — Dominio propio

1. Compra el dominio, por ejemplo `pulso.cl` en <https://www.nic.cl>.
2. En Cloudflare: tu proyecto de Pages → **Custom domains** → **Set up a custom
   domain** → escribe `demo.pulso.cl` y sigue las instrucciones de DNS.
3. Repite la parte 3 con la dirección nueva.

---

## Comprobar que todo funciona

- [ ] La dirección abre la pantalla de inicio de sesión con el recuadro
      **"Prueba la demo"**.
- [ ] **Entrar a la demo** lleva al Dashboard con datos de ejemplo y una franja
      que dice que es una demo.
- [ ] El código QR abre el kiosco en el teléfono; al elegir a Ana Pérez muestra
      su PIN de prueba (2580) y la entrada se registra.
- [ ] En *Ajustes* aparece "✓ Tarea diaria programada".
- [ ] Al día siguiente, los cambios de prueba desaparecieron.

## Para cuando tengas el primer cliente

Usa el mismo repositorio con **otro** proyecto de Supabase y **otro** proyecto
de Cloudflare Pages, **sin** las variables `VITE_DEMO*` y **sin** ejecutar
`configurar_demo.sql`. Sigue el README para configurarlo.
