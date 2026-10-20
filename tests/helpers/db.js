// Base de datos de prueba: Postgres en memoria (PGlite) con lo mínimo de
// Supabase simulado (esquemas auth/vault/net, roles anon y authenticated y sus
// permisos por defecto) y las migraciones de supabase/migrations aplicadas.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
export const MIGRACIONES = readdirSync(`${RAIZ}supabase/migrations`).filter((f) => f.endsWith(".sql")).sort();

export const ADMIN = "00000000-0000-0000-0000-000000000001";
export const USUARIO = "00000000-0000-0000-0000-000000000002";

export const leer = (ruta) => readFileSync(`${RAIZ}${ruta}`, "utf8");

const SUPABASE_SIMULADO = `
create schema extensions; create extension pgcrypto schema extensions;
create schema auth; create schema vault; create schema net;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table vault.decrypted_secrets (name text, decrypted_secret text);
insert into vault.decrypted_secrets values
  ('notificar_incidencia_url', 'http://funcion'), ('notificar_incidencia_secret', 'secreto');
-- Registro de los emails que se habrían enviado.
create table net.enviados (body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql
  as $$ insert into net.enviados values (body); select 1::bigint $$;
create role anon; create role authenticated;
grant usage on schema public, auth, extensions to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
`;

// Supabase ya trae pgcrypto instalado: se quita el "create extension".
const sinExtensiones = (sql) => sql.replace(/create extension[^;]*;/gi, "");

export async function aplicar(db, desde, hasta) {
  for (const f of MIGRACIONES.filter((m) => (!desde || m >= desde) && (!hasta || m < hasta))) {
    await db.exec(sinExtensiones(leer(`supabase/migrations/${f}`)));
  }
}

// hasta: nombre de la primera migración que NO se aplica (para probar
// migraciones sobre datos previos).
export async function crearBase({ hasta } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_SIMULADO);
  await aplicar(db, null, hasta);
  await db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'admin@x.cl'), ('${USUARIO}', 'user@x.cl')`);

  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const uno = async (sql, params) => Object.values((await q(sql, params))[0] ?? {})[0];

  // Ejecuta como un rol de Supabase: "anon" o "authenticated" con un usuario.
  async function como(rol, uid, sql, params = []) {
    await db.exec(`reset role; select set_config('test.uid', '${uid || ""}', false); set role ${rol};`);
    try {
      return { rows: (await db.query(sql, params)).rows };
    } catch (e) {
      return { error: e.message, code: e.code };
    } finally {
      await db.exec("reset role");
    }
  }
  const comoAdmin = (sql, p) => como("authenticated", ADMIN, sql, p);
  const comoUsuario = (sql, p) => como("authenticated", USUARIO, sql, p);
  const comoAnon = (sql, p) => como("anon", null, sql, p);

  const [{ hoy, ayer, ahora }] = await q(`
    select (now() at time zone 'America/Santiago')::date::text as hoy,
           ((now() at time zone 'America/Santiago')::date - 1)::text as ayer,
           (extract(hour from now() at time zone 'America/Santiago') * 60
            + extract(minute from now() at time zone 'America/Santiago'))::int as ahora`);

  return { db, q, uno, como, comoAdmin, comoUsuario, comoAnon, hoy, ayer, ahora };
}

// Minutos desde medianoche -> "HH:MM" (da la vuelta al día).
export function hhmm(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
