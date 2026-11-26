/**
 * The recipe table's layout. sst.config.ts builds the deployed table from this object, and
 * scripts/local-stack.ts builds the local emulator's table from the same object, so the two
 * cannot drift apart.
 */
export const tableLayout: {
	fields: Record<string, 'string'>;
	primaryIndex: { hashKey: string; rangeKey: string };
	globalIndexes: Record<string, { hashKey: string; rangeKey: string; projection?: string[] }>;
} = {
	fields: { pk: 'string', sk: 'string', gsi1pk: 'string', gsi1sk: 'string' },
	primaryIndex: { hashKey: 'pk', rangeKey: 'sk' },
	globalIndexes: {
		gsi1: { hashKey: 'gsi1pk', rangeKey: 'gsi1sk', projection: ['data'] }
	}
};
