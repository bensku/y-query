import * as Y from 'yjs';
import type { Table } from "./table";
import { writeData, type DeepPartial } from "./yjs-types";

export function upsert<T>(doc: Y.Doc, table: Table<T>, row: T & { key: string }) {
    writeData(doc, table, row.key, table.type.parse(row), true);
}

export function update<T>(doc: Y.Doc, table: Table<T>, update: DeepPartial<T> & { key: string }): void {
    // Write without upserting; data will be synced, but won't be visible until someone upserts
    writeData(doc, table, update.key, update, false);
}

export function remove(doc: Y.Doc, table: Table<unknown>, key: string) {
    // Delete from index only for now (soft delete)
    // Old data will not ordinarily become visible, since upsert must overwrite it all
    // TODO but we need hard delete SOMEHOW
    const rows = doc.getMap(table.name);
    rows.delete(key);
}