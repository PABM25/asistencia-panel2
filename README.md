# Pulso — control de asistencia

Panel web para registrar fichajes, detectar retrasos y ausencias, planificar
turnos y exportar las horas trabajadas. Los empleados fichan en un kiosco con
su PIN; los administradores gestionan todo desde el navegador.

**Stack:** React 18, Vite, Tailwind 4 y shadcn/ui en el frontend. Supabase
(Auth, Postgres con RLS, `pg_cron` y una Edge Function) en el backend. Resend
para los emails.

## Requisitos

- Node.js 22 (ver `.nvmrc`)
- Un proyecto de [Supabase](https://supabase.com)
- Opcional: una cuenta de [Resend](https://resend.com) para los avisos por email

## Inicio rápido

Con la base de datos ya creada ([paso 1](#1-base-de-datos)):

```bash
npm install
cp .env.example .env.local   # completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173
```

Los dos valores están en Supabase → *Project Settings → API* (`Project URL` y
la clave `anon public`).

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Genera `dist/` para producción |
| `npm run preview` | Sirve `dist/` en local |
| `npm test` | Pruebas de migraciones y cálculo de horas |
| `npm run lint` | Revisa el código con ESLint (`lint:fix` corrige lo automático) |

## Estructura

```
src/
  api/supabaseClient.js   cliente de Supabase (lee las variables VITE_*)
  api/db.js               capa de datos: db.entities.Empleado.filter(...), create, update...
  lib/AuthContext.jsx     sesión y rol del usuario
  lib/horas.js            cálculo de horas trabajadas y extra
  pages/                  una página por ruta: Dashboard, Empleados, Asistencia, Turnos...
  index.css               tema visual (colores, tipografías, radios, sombras)
supabase/
  migrations/             esquema, seguridad (RLS), kiosco y reglas de asistencia
  functions/notificar-incidencia/   envío de emails con Resend
  datos_demo.sql          datos de prueba (datos_demo_borrar.sql los quita)
  demo/configurar_demo.sql  solo para el proyecto de la demo pública
tests/                    pruebas (npm test)
docs/DEMO.md              cómo publicar la demo pública
.github/workflows/        verificación en cada push y ping para mantener la demo activa
```

## Puesta en marcha

### 1. Base de datos

En el **SQL Editor** de Supabase, ejecuta cada migración **una sola vez y en
este orden**. Volver a ejecutar una antigua después de las siguientes
reemplazaría funciones por versiones anteriores.

| Migración | Qué agrega |
| --- | --- |
| `20261019000000_esquema_inicial.sql` | Tablas, roles y seguridad por fila (RLS) |
| `20261019000001_registro_unico_y_admin.sql` | Un registro por empleado y día; fusiona duplicados conservando la entrada más temprana y la salida más tardía |
| `20261020000000_kiosco.sql` | Kiosco de fichaje con PIN |
| `20261021000000_reglas_asistencia.sql` | Tolerancia, turnos de noche, ausencias automáticas, feriados y página Ajustes |
| `20261022000000_correcciones.sql` | Turnos sin duplicados, resumen del Dashboard, resumen diario de ausencias por email |
| `20261026000000_seguridad.sql` | Bloqueo progresivo del PIN y validación de horas y textos |

Con la CLI: `supabase link --project-ref <ref>` y luego `supabase db push`.

Para cargar datos de ejemplo, ejecuta `supabase/datos_demo.sql`.

### 2. Autenticación

En Supabase → *Authentication*:

- **URL Configuration:** pon tu dominio en *Site URL* y agrega
  `http://localhost:5173/**` y `https://tu-dominio/**` en *Redirect URLs*.
- **Código de registro:** en *Email Templates → Confirm signup* incluye
  `{{ .Token }}`; la pantalla de registro pide ese código de 6 dígitos. Si
  desactivas *Confirm email*, el registro entra sin código.
- **Recuperar contraseña:** en *Email Templates → Reset Password* usa este
  enlace. El de por defecto solo funciona en el navegador donde se pidió:

  ```html
  <a href="{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery">Cambiar contraseña</a>
  ```

- **Google (opcional):** activa *Providers → Google* con tu Client ID y Secret.
  Si no está activo, la app oculta el botón.
- **SMTP propio:** recomendado en producción (*Auth → SMTP*); el de Supabase
  envía pocos emails por hora.

### 3. Administradores

- **El primer usuario que se registra queda como administrador.** Los
  siguientes entran como `user` y ven «Acceso restringido».
- Para dar acceso a otra persona:

  ```sql
  update public.profiles set role = 'admin' where email = 'persona@dominio.cl';
  ```

- **Cierra el registro** cuando existan los administradores: *Authentication →
  Sign In / Providers* → desactiva *Allow new users to sign up*. La app oculta
  «Crear cuenta». Las cuentas nuevas se crean en *Authentication → Users → Add
  user* (con *Auto Confirm User*) y se hacen admin con el `update` de arriba.

### 4. Ausencias automáticas

Activa `pg_cron` en *Database → Extensions* y pulsa **Programar** en la
página *Ajustes* de la app. Desde ahí también se marcan a mano las ausencias
de un día.

### 5. Avisos por email (opcional)

Sin esta configuración la app funciona igual; solo no envía avisos.

1. En Resend, verifica tu dominio y genera una API key.
2. Despliega la función y sus secretos:

   ```bash
   supabase functions deploy notificar-incidencia --no-verify-jwt
   supabase secrets set \
     NOTIFY_SECRET="una-clave-larga-al-azar" \
     RESEND_API_KEY="re_..." \
     EMAIL_FROM="Pulso <avisos@tudominio.cl>" \
     APP_URL="https://tu-dominio"
   ```

3. Guarda en Vault la URL de la función y la misma clave:

   ```sql
   select vault.create_secret(
     'https://<tu-proyecto>.supabase.co/functions/v1/notificar-incidencia',
     'notificar_incidencia_url');
   select vault.create_secret('una-clave-larga-al-azar', 'notificar_incidencia_secret');
   ```

Si desplegaste la función antes de la migración `20261026000000`, vuelve a
desplegarla para que entienda el resumen diario. Los intentos de envío quedan
en la tabla `net._http_response`.

## Cómo funciona

### Kiosco de fichaje

Los empleados marcan entrada y salida en una tablet o computador, eligiendo su
nombre y escribiendo su PIN. No necesitan cuenta.

1. **Asigna un PIN** en *Empleados → editar → PIN para el kiosco*: 4 a 6
   dígitos, sin PIN obvios como 1111 o 1234. Se guarda cifrado y no se puede
   volver a ver; si alguien lo olvida, asígnale uno nuevo.
2. **Activa el dispositivo:** en la tablet, entra como administrador, ve a
   *Kiosco* y pulsa *Activar este dispositivo como kiosco*. La sesión se cierra
   y la tablet queda en `/kiosco`.
3. **Revoca** un dispositivo perdido o reemplazado desde la misma página: deja
   de funcionar al instante.

Reglas del kiosco:

- La hora la pone el servidor en `America/Santiago` (función `zona_horaria()`),
  no el reloj del dispositivo.
- Cada 5 PIN incorrectos seguidos, el empleado queda bloqueado: 5 minutos, luego
  30 minutos, 2 horas y 24 horas. Un PIN correcto reinicia la cuenta. Un admin
  puede desbloquearlo en *Empleados → editar → Desbloquear el PIN*.
- No se puede marcar dos veces la entrada o la salida del mismo día. Las
  correcciones se hacen en *Asistencia*.
- El origen de cada registro indica quién lo creó: `empleado` (kiosco), `admin`
  (fichaje rápido del panel) o `sistema` (ausencia automática).
- Si el navegador borra los datos del sitio, o en modo incógnito, el
  dispositivo pierde la activación.

### Reglas de asistencia

Se configuran en la página *Ajustes*.

- **Retraso:** la entrada se compara con el turno del día o, si no hay, con el
  horario fijo del empleado, más la tolerancia (5 minutos por defecto).
- **Turnos de noche:** una salida marcada antes del mediodía cierra la jornada
  de ayer si esta cruzaba la medianoche (p. ej. 22:00–06:00) y quedó abierta.
- **Horas trabajadas:** de la entrada a la salida, menos el descanso del turno
  o el descanso por defecto (solo en jornadas de más de 6 horas). Los días sin
  salida no suman horas y se muestran aparte.
- **Horas extra:** lo que supera la jornada esperada.
- **Ausencias automáticas:** cada madrugada se marca ausente a quien debía
  trabajar el día anterior y no tiene registro. Debía trabajar si tenía turno
  o, sin turnos esa semana, si era día laboral y no feriado.
- **Dashboard:** «Sin fichar» solo cuenta a quien ya pasó su hora de entrada
  más la tolerancia.
- **Turnos:** un empleado no puede tener dos turnos que empiecen a la misma
  hora el mismo día; la asignación por departamento omite a quien ya lo tiene.

### Avisos por email

Cuando un registro se crea como `retraso` o `ausente`, o cambia a uno de esos
estados, un trigger llama a la función `notificar-incidencia`, que avisa a
todos los administradores. Las ausencias automáticas llegan en un solo resumen
diario.

## Pruebas

```bash
npm test
```

Ejecutan las migraciones sobre un Postgres en memoria (PGlite) con Supabase
simulado y cubren permisos por rol, kiosco y PIN, reglas de asistencia,
ausencias, avisos, datos de prueba y cálculo de horas. Córrelas después de
cambiar una migración o `src/lib/horas.js`. GitHub Actions las ejecuta en cada
push junto con el lint y el build.

## Diseño

El tema vive en `src/index.css`: lienzo blanco casi monocromo, títulos en
serif de peso 400 (clase `page-title`) y un único acento melocotón con texto
siena para lo que pide atención. Los colores por estado de asistencia están
en `src/lib/constants.js`.

Las tipografías (Source Serif 4 e Inter) se instalan como paquetes y se sirven
desde el propio sitio, porque la política de seguridad no permite Google Fonts.

## Publicar

`npm run build` genera `dist/`, que se publica en cualquier hosting estático
(Cloudflare Pages, Netlify, Vercel):

1. Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
2. Haz que todas las rutas sirvan `index.html`. En Netlify, crea
   `public/_redirects` con `/* /index.html 200`.
3. Revisa las cabeceras de seguridad de `public/_headers` (CSP, HSTS…), que
   Cloudflare Pages y Netlify aplican solas. La CSP solo permite conectarse a
   `*.supabase.co`: si usas un dominio propio para Supabase, agrégalo a
   `connect-src`. En otro hosting, configura las mismas cabeceras.

Para la **demo pública** que se reinicia cada noche, sigue
[docs/DEMO.md](docs/DEMO.md).
