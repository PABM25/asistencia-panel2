# Asistenta Pro — panel de asistencia

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
  pages/                  Dashboard, Empleados, Asistencia, Turnos, Horarios, Informes, login...
supabase/
  migrations/             tablas, seguridad (RLS) y trigger de avisos
  functions/notificar-incidencia/   envío de emails con Resend
```

## 1. Crear el proyecto en Supabase

1. Crea un proyecto en <https://supabase.com>.
2. Abre **SQL Editor** y ejecuta, en este orden, el contenido de:
   1. `supabase/migrations/20261019000000_esquema_inicial.sql`
   2. `supabase/migrations/20261019000001_registro_unico_y_admin.sql`
      (un solo registro de asistencia por empleado y día; si ya había
      duplicados, los fusiona conservando la entrada más temprana y la salida
      más tardía).

   O con la CLI: `supabase link --project-ref <ref>` y `supabase db push`.

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

### Configuración de Auth en Supabase (Authentication)

- **URL Configuration:** pon tu dominio en *Site URL* y agrega
  `http://localhost:5173/**` y `https://tu-dominio/**` en *Redirect URLs*.
- **Registro con código de 6 dígitos:** la pantalla de registro pide el código
  que llega por email. En *Email Templates → Confirm signup* incluye
  `{{ .Token }}` en el mensaje (puedes dejar también el enlace). Si
  desactivas *Confirm email*, el registro entra directo sin código.
- **Recuperar contraseña:** funciona sin cambios; el enlace del email lleva a
  `/reset-password`.
- **Google:** en *Providers → Google* activa el proveedor con tu Client ID y
  Secret de Google Cloud. Si no lo configuras, el botón de Google mostrará un
  error y el login con email sigue funcionando.
- Para producción conviene configurar un SMTP propio en *Auth → SMTP*; el de
  Supabase tiene un límite bajo de emails por hora.

## 4. Avisos por email de retrasos y ausencias

Cuando un registro se crea como `retraso`/`ausente` (o cambia a uno de esos
estados), un trigger de la base de datos llama a la función
`notificar-incidencia`, que envía un email a todos los administradores
usando [Resend](https://resend.com).

1. Crea una cuenta en Resend, verifica tu dominio y genera una API key.
2. Despliega la función y sus secretos (CLI de Supabase):

   ```bash
   supabase functions deploy notificar-incidencia --no-verify-jwt
   supabase secrets set \
     NOTIFY_SECRET="una-clave-larga-al-azar" \
     RESEND_API_KEY="re_..." \
     EMAIL_FROM="Asistenta Pro <avisos@tudominio.cl>" \
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

## 5. Publicar

`npm run build` genera la carpeta `dist/`, que puedes publicar en Vercel,
Netlify, Cloudflare Pages o cualquier hosting estático. Configura ahí las
variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, y agrega una regla
para que todas las rutas sirvan `index.html` (en Vercel/Netlify suele ser
automático para apps de Vite; en Netlify crea `public/_redirects` con
`/* /index.html 200`).

## Migrar datos desde Base44

Las tablas tienen las mismas columnas que las entidades originales
(`Empleado` → `empleado`, `RegistroAsistencia` → `registro_asistencia`,
`Turno` → `turno`). Exporta cada entidad a CSV desde Base44 e impórtala en
Supabase con **Table Editor → Import data from CSV**. Importa primero
`empleado` conservando su columna `id`, para que `empleado_id` de los
registros y turnos siga apuntando al empleado correcto. Los `id` son de tipo
texto, así que aceptan tal cual los identificadores de Base44; los registros
nuevos reciben un UUID automático.
