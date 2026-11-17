import { BadRequestException } from '@nestjs/common';
import { GeoFeatureQueryFilterInput } from './dto/geo-feature-query.dto';
import { GeoLayerField, GeoLayerFieldType } from './geo.types';

/**
 * Translates GeoFeatureQueryFilter[] into a parameterized SQL WHERE
 * fragment. Every value is bound through ParamBuilder — never concatenated
 * into the SQL text — which is what spec §27 requires ("nunca concatenar
 * filtros del usuario en SQL"). The only things chosen from a fixed,
 * server-controlled set are: which column/JSONB-path expression a field
 * maps to, which comparison operator is emitted, and which cast is applied
 * — never raw user text.
 *
 * A field's *name* is still bound as a parameter (`properties_json ->> $n`
 * accepts a bound key), not interpolated, so even field names carry no
 * injection surface.
 */

export class ParamBuilder {
  private readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  get params(): unknown[] {
    return this.values;
  }
}

export type FieldExpression = { expr: string; type: GeoLayerFieldType };

/** The columns real enough to have their own SQL expression, not JSONB. */
const BUILTIN_FIELD_EXPRESSIONS: Record<string, FieldExpression> = {
  code: { expr: 't.code', type: 'string' },
  name: { expr: 't.name', type: 'string' },
  level: { expr: 't.level', type: 'string' },
  areaHa: { expr: 'tf.area_ha', type: 'number' },
};

/**
 * Resolves a field name (from a filter, or — see geo-sort-sql.ts — a sort
 * request) to a SQL expression and its schema type. Shared by both so there
 * is one definition of "how a field name becomes SQL", not two that could
 * drift — e.g. a field valid to filter on but rejected when sorting, or
 * vice versa, for no real reason.
 */
export function resolveFieldExpression(
  fieldName: string,
  schema: GeoLayerField[],
  params: ParamBuilder,
): FieldExpression & { fieldSchema: GeoLayerField | null } {
  const builtin = BUILTIN_FIELD_EXPRESSIONS[fieldName];
  if (builtin) {
    return { ...builtin, fieldSchema: null };
  }

  const fieldSchema = schema.find((field) => field.name === fieldName);
  if (!fieldSchema) {
    throw new BadRequestException(`Campo desconocido: "${fieldName}".`);
  }

  const keyPlaceholder = params.add(fieldName);
  return { expr: `(tf.properties_json ->> ${keyPlaceholder})`, type: fieldSchema.type, fieldSchema };
}

function assertFiniteNumber(value: unknown, field: string): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    throw new BadRequestException(`Valor numérico inválido para el campo "${field}".`);
  }
  return num;
}

export function buildFilterClause(
  filter: GeoFeatureQueryFilterInput,
  schema: GeoLayerField[],
  params: ParamBuilder,
): string {
  const { expr, type } = resolveFieldExpression(filter.field, schema, params);
  const numericExpr = `(${expr})::numeric`;

  switch (filter.operator) {
    case 'eq':
      return type === 'number'
        ? `${numericExpr} = ${params.add(assertFiniteNumber(filter.value, filter.field))}`
        : `${expr} = ${params.add(String(filter.value))}`;

    case 'neq':
      return type === 'number'
        ? `${numericExpr} != ${params.add(assertFiniteNumber(filter.value, filter.field))}`
        : `${expr} != ${params.add(String(filter.value))}`;

    case 'contains':
      return `POSITION(LOWER(${params.add(String(filter.value))}) IN LOWER(COALESCE(${expr}, ''))) > 0`;

    case 'in': {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        throw new BadRequestException(
          `El operador "in" requiere un arreglo de valores para "${filter.field}".`,
        );
      }
      if (type === 'number') {
        const numbers = filter.value.map((value) => assertFiniteNumber(value, filter.field));
        return `${numericExpr} = ANY(${params.add(numbers)}::numeric[])`;
      }
      return `${expr} = ANY(${params.add(filter.value.map(String))}::text[])`;
    }

    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (type !== 'number' && type !== 'date') {
        throw new BadRequestException(
          `El operador "${filter.operator}" solo aplica a campos numéricos o de fecha ` +
            `("${filter.field}" es de tipo "${type}").`,
        );
      }
      const sqlOperator = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[filter.operator];
      const castExpr = type === 'number' ? numericExpr : `(${expr})::date`;
      const boundValue = type === 'number' ? assertFiniteNumber(filter.value, filter.field) : String(filter.value);
      return `${castExpr} ${sqlOperator} ${params.add(boundValue)}`;
    }

    default:
      // Unreachable: geo-feature-query.dto.ts already rejects unknown operators.
      throw new BadRequestException(`Operador de filtro no soportado: "${filter.operator}".`);
  }
}
