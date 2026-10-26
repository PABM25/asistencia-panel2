// Capa de datos sobre Supabase. Las páginas no usan el cliente de Supabase
// directamente: pasan por aquí, que limpia los datos y traduce los errores.
//
// Por entidad:
//   db.entities.Empleado.filter(query, { sort, limit, skip })  -> { items }
//   db.entities.Empleado.filterAll(query, { sort })            -> { items } (todas las páginas)
//   db.entities.Empleado.count(query)                          -> number
//   db.entities.Empleado.create(data) / update(id, data) / delete(id)
//   db.entities.Turno.bulkCreate([...]) / bulkCreateIgnoringDuplicates([...], columnas)
// Funciones de la base de datos: rpc("nombre", { parametros })
//
// Formato de las consultas:
//   { campo: valor }                        igualdad
//   { campo: { $gte, $lte, $gt, $lt, $ne } } comparaciones
//   { campo: { $in: [...] } }               lista de valores
//   { campo: { $regex: "texto", $options: "i" } }  búsqueda parcial (sin distinguir mayúsculas)
//   { $or: [ {campo: {$regex: ...}}, ... ] }        cualquiera de las condiciones
import { supabase } from '@/api/supabaseClient';

const SCHEMAS = {
  Empleado: {
    table: 'empleado',
    columns: [
      'nombre', 'apellidos', 'email', 'telefono', 'departamento', 'cargo',
      'fecha_alta', 'estado', 'horario_entrada', 'horario_salida',
    ],
    numbers: [],
    // Se pueden filtrar pero no escribir (los mantiene la base de datos).
    readOnly: ['tiene_pin'],
  },
  RegistroAsistencia: {
    table: 'registro_asistencia',
    columns: [
      'empleado_id', 'empleado_nombre', 'fecha', 'hora_entrada', 'hora_salida',
      'estado', 'notas', 'registrado_por',
    ],
    numbers: [],
  },
  Turno: {
    table: 'turno',
    columns: [
      'empleado_id', 'empleado_nombre', 'departamento', 'cargo', 'fecha',
      'hora_inicio', 'hora_fin', 'tipo', 'minutos_descanso', 'notas',
    ],
    numbers: ['minutos_descanso'],
  },
};

// Escapa los comodines de LIKE para que el texto buscado se tome literal.
// Columnas que tienen todas las tablas y se pueden usar en filtros y orden.
const SYSTEM_COLUMNS = ['id', 'created_date', 'updated_date'];

// Lista blanca de columnas para filtros y orden: un nombre de campo nunca
// llega a la consulta de PostgREST si no es una columna conocida.
function checkField(schema, field) {
  if (!schema.fields.has(field)) throw new Error(`Campo no permitido: ${field}`);
  return field;
}

const likePattern = (text) => `%${String(text).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Valor para la sintaxis de texto de PostgREST usada dentro de .or(...)
const orValue = (value) => `"${String(value).replace(/[\\"]/g, (c) => `\\${c}`)}"`;

function isOperatorObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function applyCondition(schema, builder, field, value) {
  checkField(schema, field);
  if (!isOperatorObject(value)) {
    return value === null ? builder.is(field, null) : builder.eq(field, value);
  }
  let b = builder;
  for (const [op, v] of Object.entries(value)) {
    switch (op) {
      case '$gte': b = b.gte(field, v); break;
      case '$lte': b = b.lte(field, v); break;
      case '$gt': b = b.gt(field, v); break;
      case '$lt': b = b.lt(field, v); break;
      case '$ne': b = v === null ? b.not(field, 'is', null) : b.neq(field, v); break;
      case '$in': b = b.in(field, v); break;
      case '$regex': {
        const insensitive = String(value.$options || '').includes('i');
        b = insensitive ? b.ilike(field, likePattern(v)) : b.like(field, likePattern(v));
        break;
      }
      case '$options': break;
      default:
        throw new Error(`Operador de filtro no soportado: ${op}`);
    }
  }
  return b;
}

// Convierte una condición simple al texto que entiende .or() de PostgREST.
// Devuelve una lista: si tiene más de un elemento, deben cumplirse todos.
function orClauses(schema, field, value) {
  checkField(schema, field);
  if (!isOperatorObject(value)) {
    return [value === null ? `${field}.is.null` : `${field}.eq.${orValue(value)}`];
  }
  if ('$regex' in value) {
    const op = String(value.$options || '').includes('i') ? 'ilike' : 'like';
    return [`${field}.${op}.${orValue(likePattern(value.$regex))}`];
  }
  if ('$in' in value) {
    return [`${field}.in.(${value.$in.map(orValue).join(',')})`];
  }
  const map = { $gte: 'gte', $lte: 'lte', $gt: 'gt', $lt: 'lt', $ne: 'neq' };
  return Object.entries(value).map(([op, v]) => {
    if (!map[op]) throw new Error(`Operador no soportado dentro de $or: ${op}`);
    return `${field}.${map[op]}.${orValue(v)}`;
  });
}

function applyQuery(schema, builder, query = {}) {
  let b = builder;
  for (const [field, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (field === '$or') {
      const parts = value.flatMap((cond) =>
        Object.entries(cond).map(([f, v]) => {
          const clauses = orClauses(schema, f, v);
          return clauses.length > 1 ? `and(${clauses.join(',')})` : clauses[0];
        })
      );
      if (parts.length) b = b.or(parts.join(','));
    } else {
      b = applyCondition(schema, b, field, value);
    }
  }
  return b;
}

function applySort(schema, builder, sort) {
  if (!sort) return builder;
  const desc = sort.startsWith('-');
  const field = checkField(schema, desc ? sort.slice(1) : sort);
  return builder.order(field, { ascending: !desc, nullsFirst: false });
}

// Deja solo las columnas conocidas, convierte "" en null y los números a número.
function clean(schema, data) {
  const out = {};
  for (const key of schema.columns) {
    if (!(key in data)) continue;
    let v = data[key];
    if (v === '' || v === undefined) v = null;
    if (v !== null && schema.numbers.includes(key)) {
      const n = Number(v);
      v = Number.isFinite(n) ? n : null;
    }
    out[key] = v;
  }
  return out;
}

// Mensajes legibles para los errores de Postgres más habituales.
const FRIENDLY_ERRORS = {
  '22P02': 'Algún valor no tiene el formato correcto.',
  '23503': 'El registro está relacionado con otros datos.',
  '23505': 'Ya existe un registro con esos datos (por ejemplo, el mismo empleado en la misma fecha).',
  '23502': 'Falta un dato obligatorio.',
  '23514': 'Algún valor no es válido.',
  '42501': 'No tienes permisos para esta acción.',
};

// Códigos con los que las funciones SQL de supabase/migrations lanzan
// mensajes escritos para el usuario (raise exception ... using errcode).
const OWN_MESSAGE_CODES = new Set(['22023', 'P0002']);

// Mensaje que se puede mostrar en pantalla para un error de Supabase. El
// mensaje original de Postgres puede revelar tablas, restricciones o partes
// de la consulta, así que solo se muestra si lo escribimos nosotros.
export function dbErrorMessage(error) {
  if (FRIENDLY_ERRORS[error?.code]) return FRIENDLY_ERRORS[error.code];
  if (OWN_MESSAGE_CODES.has(error?.code) && error.message) return error.message;
  return 'Error en la base de datos. Inténtalo de nuevo.';
}

// PostgREST devuelve como máximo 1000 filas por petición.
const PAGE_SIZE = 1000;

function raise(error) {
  if (error) {
    const err = new Error(dbErrorMessage(error));
    err.status = error.code === 'PGRST301' || error.code === '42501' ? 403 : undefined;
    // El detalle completo queda solo para la consola (ver notifyError).
    err.details = error;
    throw err;
  }
}

function makeEntity(schema) {
  const table = () => supabase.from(schema.table);

  return {
    async filter(query = {}, { sort, limit, skip } = {}) {
      let b = applyQuery(schema, table().select('*'), query);
      b = applySort(schema, b, sort);
      if (limit) {
        const from = skip || 0;
        b = b.range(from, from + limit - 1);
      }
      const { data, error } = await b;
      raise(error);
      return { items: data || [] };
    },

    // Como filter(), pero recorre todas las páginas: no corta en 1000 filas.
    async filterAll(query = {}, { sort } = {}) {
      const items = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        // Se ordena también por id para que la paginación sea estable.
        const b = applySort(schema, applyQuery(schema, table().select('*'), query), sort).order('id');
        const { data, error } = await b.range(from, from + PAGE_SIZE - 1);
        raise(error);
        items.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }
      return { items };
    },

    async list(options = {}) {
      return this.filter({}, options);
    },

    async get(id) {
      const { data, error } = await table().select('*').eq('id', id).single();
      raise(error);
      return data;
    },

    async count(query = {}) {
      const { count, error } = await applyQuery(
        schema,
        table().select('id', { count: 'exact', head: true }),
        query
      );
      raise(error);
      return count || 0;
    },

    async create(data) {
      const { data: row, error } = await table().insert(clean(schema, data)).select().single();
      raise(error);
      return row;
    },

    async bulkCreate(rows) {
      if (!rows?.length) return [];
      const { data, error } = await table().insert(rows.map((r) => clean(schema, r))).select();
      raise(error);
      return data || [];
    },

    // Inserta varias filas y omite las que ya existen según la restricción
    // única indicada (p. ej. 'empleado_id,fecha,hora_inicio'). Devuelve solo
    // las filas creadas.
    async bulkCreateIgnoringDuplicates(rows, onConflict) {
      if (!rows?.length) return [];
      const { data, error } = await table()
        .upsert(rows.map((r) => clean(schema, r)), { onConflict, ignoreDuplicates: true })
        .select();
      raise(error);
      return data || [];
    },

    async update(id, data) {
      const { data: row, error } = await table()
        .update(clean(schema, data))
        .eq('id', id)
        .select()
        .single();
      raise(error);
      return row;
    },

    async delete(id) {
      const { error } = await table().delete().eq('id', id);
      raise(error);
      return { id };
    },
  };
}

// Llama a una función de la base de datos (supabase/migrations) y lanza un
// Error legible si falla.
export async function rpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args);
  raise(error);
  return data;
}

export const db = {
  entities: Object.fromEntries(
    Object.entries(SCHEMAS).map(([name, schema]) => [
      name,
      makeEntity({
        ...schema,
        fields: new Set([...schema.columns, ...(schema.readOnly || []), ...SYSTEM_COLUMNS]),
      }),
    ])
  ),
};
