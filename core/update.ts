import type * as Y from 'yjs';
import type { Table, TableBase } from './table';
import { type DeepPartial, writeData } from './yjs-types';

/**
 * Inserts new or updates an existing row in a table.
 *
 * If multiple peers upsert simultaneously, y-query structured data on the row
 * will be merged with last-writer-wins semantics. Raw Yjs shared
 * types are merged using Yjs semantics. In other words: use raw Yjs types
 * to avoid data loss if you expect concurrent upserts on same rows.
 * @param doc Database to operate on.
 * @param table Table to write to.
 * @param row Row id. Whenever possible, you should use generated row ids
 * (e.g. UUIDs) to avoid concurrent upserts. If unable, consider using raw
 * Yjs types for data you do not wish to lose due to last-writer-wins.
 */
export function upsert<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    row: T & { key: string },
) {
    writeData(doc, table, row.key, table.type.parse(row), true);
}

/**
 * Updates a table row.
 *
 * If multiple peers update y-query structured data cells simultaneously,
 * last-writer-wins semantics apply. Raw Yjs shared types are not updated
 * using this function; just modify them directly.
 *
 * If a row that does not exist is updated, the data is nevertheless synced.
 * The row will become visible when/if it is ever upserted. Although upserts
 * overwrite structured y-query data, raw Yjs shared types may retain some
 * information. While it is best to avoid updating before upserting, it is
 * not end of the world if this occasionally happens in multi-peer
 * upsert-update-remove cycles.
 * @param doc Database to operate on.
 * @param table Table to write to.
 * @param update Update to an existing row. Must have key, all other fields
 * are optional.
 */
export function update<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    update: DeepPartial<T> & { key: string },
): void {
    // Write without upserting; data will be synced, but won't be visible until someone upserts
    writeData(doc, table, update.key, update, false);
}

/**
 * Soft-deletes a row from a table. The row will no longer be observable
 * using y-query, but its data is not actually deleted.
 * @param doc Database to operate on.
 * @param table Table to write to.
 * @param key Key in table.
 */
export function remove<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    key: string,
) {
    // Delete from index only for now (soft delete)
    // Old data will not ordinarily become visible, since upsert must overwrite it all
    // TODO but we need hard delete SOMEHOW
    const rows = doc.getMap(table.name);
    rows.delete(key);
}
