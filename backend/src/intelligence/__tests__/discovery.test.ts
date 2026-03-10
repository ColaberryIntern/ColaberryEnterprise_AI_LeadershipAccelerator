import { classifyAll } from '../discovery/semanticClassifier';
import { mapRelationships, detectHubEntity } from '../discovery/relationshipMapper';
import type { SchemaSnapshot, ColumnInfo } from '../discovery/schemaInspector';

describe('SemanticClassifier', () => {
  it('classifies currency columns', () => {
    const columns = {
      orders: [
        { column_name: 'total_amount', data_type: 'numeric', table_name: 'orders', is_nullable: 'YES', column_default: null, ordinal_position: 1 },
        { column_name: 'price', data_type: 'double precision', table_name: 'orders', is_nullable: 'YES', column_default: null, ordinal_position: 2 },
      ],
    };
    const result = classifyAll(columns);
    expect(result.orders.total_amount).toBe('currency');
    expect(result.orders.price).toBe('currency');
  });

  it('classifies date columns', () => {
    const columns = {
      users: [
        { column_name: 'created_at', data_type: 'timestamp with time zone', table_name: 'users', is_nullable: 'YES', column_default: null, ordinal_position: 1 },
        { column_name: 'birth_date', data_type: 'date', table_name: 'users', is_nullable: 'YES', column_default: null, ordinal_position: 2 },
      ],
    };
    const result = classifyAll(columns);
    expect(result.users.created_at).toBe('date');
    expect(result.users.birth_date).toBe('date');
  });

  it('classifies id columns', () => {
    const columns = {
      orders: [
        { column_name: 'user_id', data_type: 'uuid', table_name: 'orders', is_nullable: 'NO', column_default: null, ordinal_position: 1 },
        { column_name: 'id', data_type: 'integer', table_name: 'orders', is_nullable: 'NO', column_default: null, ordinal_position: 2 },
      ],
    };
    const result = classifyAll(columns);
    expect(result.orders.user_id).toBe('id');
    expect(result.orders.id).toBe('id');
  });

  it('classifies email and boolean columns', () => {
    const columns = {
      contacts: [
        { column_name: 'email_address', data_type: 'character varying', table_name: 'contacts', is_nullable: 'YES', column_default: null, ordinal_position: 1 },
        { column_name: 'is_active', data_type: 'boolean', table_name: 'contacts', is_nullable: 'NO', column_default: null, ordinal_position: 2 },
      ],
    };
    const result = classifyAll(columns);
    expect(result.contacts.email_address).toBe('email');
    expect(result.contacts.is_active).toBe('boolean');
  });
});

describe('RelationshipMapper', () => {
  const makeSnapshot = (fks: SchemaSnapshot['foreign_keys'], columns: Record<string, ColumnInfo[]>): SchemaSnapshot => ({
    tables: Object.keys(columns).map((t) => ({ table_name: t, table_type: 'BASE TABLE' })),
    columns,
    foreign_keys: fks,
    primary_keys: {},
    row_counts: {},
  });

  it('detects explicit foreign keys', () => {
    const snapshot = makeSnapshot(
      [{ constraint_name: 'fk_1', source_table: 'orders', source_column: 'user_id', target_table: 'users', target_column: 'id' }],
      {
        orders: [{ column_name: 'user_id', data_type: 'uuid', table_name: 'orders', is_nullable: 'NO', column_default: null, ordinal_position: 1 }],
        users: [{ column_name: 'id', data_type: 'uuid', table_name: 'users', is_nullable: 'NO', column_default: null, ordinal_position: 1 }],
      }
    );

    const result = mapRelationships(snapshot);
    expect(result.relationships.length).toBeGreaterThanOrEqual(1);
    expect(result.relationships[0].type).toBe('foreign_key');
    expect(result.relationships[0].confidence).toBe(1.0);
  });

  it('infers relationships from _id naming', () => {
    const snapshot = makeSnapshot(
      [],
      {
        orders: [{ column_name: 'campaign_id', data_type: 'uuid', table_name: 'orders', is_nullable: 'YES', column_default: null, ordinal_position: 1 }],
        campaigns: [{ column_name: 'id', data_type: 'uuid', table_name: 'campaigns', is_nullable: 'NO', column_default: null, ordinal_position: 1 }],
      }
    );

    const result = mapRelationships(snapshot);
    const inferred = result.relationships.filter((r) => r.type === 'inferred');
    expect(inferred.length).toBe(1);
    expect(inferred[0].target_table).toBe('campaigns');
    expect(inferred[0].confidence).toBe(0.8);
  });

  it('detects hub entity', () => {
    const rels = [
      { source_table: 'orders', source_column: 'lead_id', target_table: 'leads', target_column: 'id', type: 'foreign_key' as const, confidence: 1 },
      { source_table: 'campaigns', source_column: 'lead_id', target_table: 'leads', target_column: 'id', type: 'foreign_key' as const, confidence: 1 },
      { source_table: 'activities', source_column: 'lead_id', target_table: 'leads', target_column: 'id', type: 'foreign_key' as const, confidence: 1 },
    ];
    expect(detectHubEntity(rels)).toBe('leads');
  });
});
