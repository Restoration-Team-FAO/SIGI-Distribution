import { BadRequestException } from '@nestjs/common';
import { ParamBuilder, resolveFieldExpression } from './geo-filter-sql';
import { GeoLayerField } from './geo.types';

export type GeoSortInput = { field: string; direction: 'asc' | 'desc' };

/**
 * Builds a safe `ORDER BY` fragment for one field (P0-7, attribute table
 * sorting). Reuses geo-filter-sql's field resolver — the same field-name
 * validation and JSONB-path binding filters rely on — so a field that is
 * filterable but not exposed for sorting (or vice versa) can never happen
 * by accident.
 *
 * Direction is chosen from a fixed two-value switch, never interpolated
 * from request text, same posture as everything in geo-filter-sql.ts.
 */
export function buildSortClause(
  sort: GeoSortInput,
  schema: GeoLayerField[],
  params: ParamBuilder,
): string {
  const { expr, type, fieldSchema } = resolveFieldExpression(sort.field, schema, params);

  // Builtin fields (code/name/level/areaHa) are always sortable; JSONB-derived
  // fields must be explicitly marked sortable in the schema.
  if (fieldSchema && !fieldSchema.sortable) {
    throw new BadRequestException(`El campo "${sort.field}" no admite ordenamiento.`);
  }

  const castExpr = type === 'number' ? `(${expr})::numeric` : type === 'date' ? `(${expr})::date` : expr;
  const sqlDirection = sort.direction === 'desc' ? 'DESC' : 'ASC';

  // NULLS LAST regardless of direction: an absent attribute should not
  // dominate the front of a descending sort just because SQL's default
  // NULLS behavior differs by direction.
  return `${castExpr} ${sqlDirection} NULLS LAST`;
}
