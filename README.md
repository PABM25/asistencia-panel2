# Pulso — control de asistencia

Panel para gestionar empleados, fichajes, turnos, horarios e informes.
Frontend en React + Vite + Tailwind (shadcn/ui). Backend en **Supabase**:
login, base de datos Postgres y una Edge Function que avisa por email de
retrasos y ausencias.

## Estructura

```
src/
  api/supabaseClient.js   cliente de Supabase (lee las variables VITE_*)
  api/db.js               capa de datos: db.entities.Empleado.filter(...), create, update...
  lib/AuthContext.jsx     sesión y rol del usuario
  pages/                  Dashboard, Empleados, Asistencia, Turnos, Horarios, Informes,
                          Kiosco, Ajustes, login...
supabase/
  migrations/             tablas, seguridad (RLS), kiosco, reglas de asistencia
  functions/notificar-incidencia/   envío de emails con Resend
  datos_demo.sql          datos de prueba (y datos_demo_borrar.sql)
  demo/configurar_demo.sql  SOLO para el proyecto de la demo pública
tests/                    pruebas (npm test)
docs/DEMO.md              cómo publicar la demo
.github/workflows/        verificación automática y mantener la demo activa
```

## 1. Crear el proyecto en Supabase

1. Crea un proyecto en <https://supabase.com>.
2. Abre **SQL Editor** y ejecuta, en este orden, el contenido de:
   1. `supabase/migrations/20261019000000_esquema_inicial.sql`
   2. `supabase/migrations/20261019000001_registro_unico_y_admin.sql`
      (un solo registro de asistencia por empleado y día; si ya había
      duplicados, los fusiona conservando la entrada más temprana y la salida
      más tardía).
   3. `supabase/migrations/20261020000000_kiosco.sql` (modo kiosco con PIN).
   4. `supabase/migrations/20261021000000_reglas_asistencia.sql` (tolerancia,
      turnos de noche, ausencias automáticas, feriados y página Ajustes).
   5. `supabase/migrations/20261022000000_correcciones.sql` (turnos sin
      duplicados, resumen del Dashboard, resumen diario de ausencias por email,
      datos del empleado siempre al día).

   O con la CLI: `supabase link --project-ref <ref>` y `supabase db push`.

   **Ejecuta cada migración una sola vez y en orden.** Volver a ejecutar una
   antigua después de las siguientes reemplazaría funciones por versiones
   anteriores.

## 2. Ejecutar la app en local

```bash
npm install
cp .env.example .env.local   # y completa los dos valores
npm run dev
```

Los valores están en Supabase → **Project Settings → API** (`Project URL` y
la clave `anon public`). Abre <http://localhost:5173>.

## 3. Usuarios y permisos

- **El primer usuario que se registra queda como administrador.** Los
  siguientes entran como `user` y ven una pantalla de "Acceso restringido".
- Para dar acceso a otra persona, en el SQL Editor:

  ```sql
  update public.profiles set role = 'admin' where email = 'persona@dominio.cl';
  ```

- Las reglas de seguridad (RLS) hacen que solo los administradores puedan leer
  o modificar empleados, registros y turnos, aunque alguien tenga la clave anon.
- **Cierra el registro cuando ya existan los administradores:** en Supabase,
  *Authentication → Sign In / Providers*, desactiva *Allow new users to sign
  up*. La app oculta entonces "Crear cuenta". Para dar acceso a alguien nuevo,
  créalo en *Authentication → Users → Add user* (marca *Auto Confirm User*) y
  hazlo admin con el `update` de arriba.

### Configuración de Auth en Supabase (Authentication)

- **URL Configuration:** pon tu dominio en *Site URL* y agrega
  `http://localhost:5173/**` y `https://tu-dominio/**` en *Redirect URLs*.
- **Registro con código de 6 dígitos:** la pantalla de registro pide el código
  que llega por email. En *Email Templates → Confirm signup* incluye
  `{{ .Token }}` en el mensaje (puedes dejar también el enlace). Si
  desactivas *Confirm email*, el registro entra directo sin código.
- **Recuperar contraseña:** en *Email Templates → Reset Password* cambia el
  enlace por este, para que funcione aunque se abra en otro navegador o en el
  teléfono:

  ```html
  <a href="{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery">Cambiar contraseña</a>
  ```

  Con el enlace por defecto solo funciona en el mismo navegador donde se pidió.
- **Google:** en *Providers → Google* activa el proveedor con tu Client ID y
  Secret de Google Cloud. Si no está activado, la app oculta el botón.
- Para producción conviene configurar un SMTP propio en *Auth → SMTP*; el de
  Supabase tiene un límite bajo de emails por hora.

## Kiosco de fichaje

Los empleados marcan su entrada y salida desde un dispositivo en la entrada
(tablet o computador), eligiendo su nombre y escribiendo su PIN. No necesitan
cuenta.

1. **Asigna un PIN** a cada empleado en *Empleados → editar → PIN para el
   kiosco* (4 a 6 dígitos; se rechazan PIN obvios como 1111 o 1234). El PIN se
   guarda cifrado y no se puede volver a ver; si alguien lo olvida, asígnale
   uno nuevo.
2. **Activa el dispositivo:** en la tablet, inicia sesión como administrador,
   ve a *Kiosco* y pulsa *Activar este dispositivo como kiosco*. Se cierra la
   sesión y la tablet queda en `/kiosco`.
3. Para dejar de usar un dispositivo (pérdida, cambio), pulsa *Revocar* en la
   misma página: deja de funcionar al instante.

Detalles:

- La hora la pone el servidor en la zona horaria `America/Santiago` (función
  `zona_horaria()` en la migración), no el reloj del dispositivo.
- Tras 5 PIN incorrectos, el empleado queda bloqueado 5 minutos. Un admin puede
  desbloquearlo antes en *Empleados → editar → Desbloquear el PIN*.
- No se puede marcar dos veces la entrada o la salida del mismo día; para
  corregir una hora, edita el registro en *Asistencia*.
- Los registros del kiosco aparecen con origen `empleado`; los del fichaje
  rápido del panel, con origen `admin`.
- Si el navegador borra los datos del sitio (o usas modo incógnito), el
  dispositivo pierde la activación y hay que activarlo de nuevo.

## Reglas de asistencia (página Ajustes)

- **Retraso:** se compara la hora de entrada con el **turno del día** (si el
  empleado tiene uno asignado) o con su **horario fijo**, más los minutos de
  **tolerancia** (5 por defecto).
- **Turnos de noche:** si alguien marca la salida antes del mediodía y su
  jornada de ayer cruzaba la medianoche (p. ej. 22:00–06:00) y quedó abierta,
  la salida cierra la jornada de ayer.
- **Horas trabajadas y extra** (Informes): entrada a salida, menos el descanso
  del turno o el descanso por defecto (solo en jornadas de más de 6 horas). Las
  horas extra son lo que supera la jornada esperada. Los días con entrada pero
  sin salida no suman horas y se indican aparte.
- **Ausencias automáticas:** cada madrugada se marca "ausente" (origen
  `sistema`) a quien debía trabajar el día anterior y no tiene ningún registro.
  Debía trabajar si tenía turno ese día o, si no usa turnos esa semana, si era
  día laboral y no feriado. Los feriados se cargan en *Ajustes*.

  Para que corra sola hace falta **pg_cron**: en Supabase ve a *Database →
  Extensions*, activa `pg_cron` y luego pulsa *Programar* en *Ajustes*. Ahí
  también puedes marcar a mano las ausencias de un día.
  Las ausencias automáticas se avisan en **un solo email resumen** por día.
- **Dashboard:** "Trabajan hoy" y "Ausentes / sin fichar" usan esta misma
  regla; "sin fichar" solo cuenta a quien ya pasó su hora de entrada (más la
  tolerancia).
- **Turnos:** un empleado no puede tener dos turnos que empiecen a la misma
  hora el mismo día; la asignación por departamento omite a quien ya lo tiene.

## 4. Avisos por email de retrasos y ausencias

Cuando un registro se crea como `retraso`/`ausente` (o cambia a uno de esos
estados), un trigger de la base de datos llama a la función
`notificar-incidencia`, que envía un email a todos los administradores
usando [Resend](https://resend.com). Las ausencias automáticas no generan un
email cada una: se envía un resumen diario con todas.

Si ya habías desplegado la función antes de la migración `20261022000000`,
vuelve a desplegarla (`supabase functions deploy notificar-incidencia
--no-verify-jwt`) para que entienda el resumen diario.

1. Crea una cuenta en Resend, verifica tu dominio y genera una API key.
2. Despliega la función y sus secretos (CLI de Supabase):

   ```bash
   supabase functions deploy notificar-incidencia --no-verify-jwt
   supabase secrets set \
     NOTIFY_SECRET="una-clave-larga-al-azar" \
     RESEND_API_KEY="re_..." \
     EMAIL_FROM="Pulso <avisos@tudominio.cl>" \
     APP_URL="https://tu-dominio"
   ```

3. Guarda en Vault la URL de la función y la misma clave (SQL Editor):

   ```sql
   select vault.create_secret(
     'https://<tu-proyecto>.supabase.co/functions/v1/notificar-incidencia',
     'notificar_incidencia_url');
   select vault.create_secret('una-clave-larga-al-azar', 'notificar_incidencia_secret');
   ```

Mientras estos dos secretos no existan, la app funciona igual y simplemente no
envía avisos. Los intentos de envío quedan en la tabla `net._http_response`.

## Pruebas

```bash
npm test
```

Prueba las migraciones sobre un Postgres en memoria (PGlite) con Supabase
simulado: permisos por rol, kiosco y PIN, reglas de asistencia, ausencias,
avisos por email y datos de prueba; y el cálculo de horas. Ejecútalas después
de cambiar una migración o `src/lib/horas.js`.

## 5. Publicar

**Demo pública para mostrar a clientes:** sigue [docs/DEMO.md](docs/DEMO.md)
(Cloudflare Pages + un proyecto de Supabase solo para la demo, que se reinicia
cada noche).

`npm run build` genera la carpeta `dist/`, que puedes publicar en Cloudflare
Pages, Netlify o cualquier hosting estático. Configura ahí las
variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, y agrega una regla
para que todas las rutas sirvan `index.html` (en Vercel/Netlify suele ser
automático para apps de Vite; en Netlify crea `public/_redirects` con
`/* /index.html 200`).


