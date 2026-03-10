import { ColumnInfo } from './schemaInspector';
import { ColumnProfile } from './dataProfiler';

// Keyword-based semantic type classification (port of Python SemanticClassifier)
const SEMANTIC_RULES: [string, RegExp][] = [
  ['currency', /price|amount|revenue|cost|fee|salary|budget|payment|total|balance|income|expense/i],
  ['percentage', /percent|pct|rate|ratio/i],
  ['count', /count|qty|quantity|num_|number_of|total_/i],
  ['score', /score|rating|rank|grade|weight/i],
  ['email', /email|e_mail/i],
  ['phone', /phone|mobile|fax|tel/i],
  ['url', /url|href|link|website/i],
  ['geo_lat', /lat|latitude/i],
  ['geo_lng', /lng|lon|longitude/i],
  ['boolean', /is_|has_|can_|should_|enabled|active|visible|deleted|archived|verified/i],
  ['id', /_id$|^id$|uuid/i],
  ['date', /_at$|_date$|_time$|timestamp|created|updated|deleted|expires|deadline|scheduled/i],
  ['name', /name$|title$|label$|display_name|full_name|first_name|last_name/i],
  ['description', /description|summary|notes|comment|body|content|text|narrative|detail|bio|about/i],
  ['category', /type$|status$|category|genre|kind|role$|stage$|level$|tier$|group$|class$/i],
];

function classifyColumn(
  columnName: string,
  dataType: string,
  _profile?: ColumnProfile
): string {
  const lowerName = columnName.toLowerCase();
  const lowerType = dataType.toLowerCase();

  // Check explicit data types first
  if (lowerType === 'boolean') return 'boolean';
  if (lowerType.includes('timestamp') || lowerType === 'date') return 'date';
  if (lowerType === 'uuid') return 'id';
  if (lowerType === 'jsonb' || lowerType === 'json') return 'json';
  if (lowerType.includes('vector')) return 'embedding';
  if (lowerType === 'inet' || lowerType === 'cidr') return 'network';

  // Check name-based rules
  for (const [semanticType, pattern] of SEMANTIC_RULES) {
    if (pattern.test(lowerName)) return semanticType;
  }

  // Fallback based on data type
  if (['integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision'].some((t) => lowerType.includes(t))) {
    return 'numeric';
  }
  if (['character varying', 'text', 'character', 'varchar', 'char'].some((t) => lowerType.includes(t))) {
    return 'text';
  }
  if (lowerType === 'array' || lowerType.includes('[]')) return 'array';

  return 'other';
}

export function classifyAll(
  columns: Record<string, { column_name: string; data_type: string }[]>,
  profiles?: Record<string, { columns: Record<string, ColumnProfile> }>
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};

  for (const [tableName, cols] of Object.entries(columns)) {
    result[tableName] = {};
    for (const col of cols) {
      const profile = profiles?.[tableName]?.columns?.[col.column_name];
      result[tableName][col.column_name] = classifyColumn(col.column_name, col.data_type, profile);
    }
  }

  return result;
}
