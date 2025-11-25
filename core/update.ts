import type { DataSource, Partition } from "./storage";
import type { Table } from "./table";
import { writeData, type DeepPartial } from "./yjs-types";

export function upsert<T>(storage: DataSource, table: Table<T>, row: T & { key: string }) {
    const partition = pickPartition(storage.partitions(row.key), table, row.key);
    writeData(partition.doc, table, row.key, table.type.parse(row), true);
}

export function update<T>(storage: DataSource, table: Table<T>, update: DeepPartial<T> & { key: string }): void {
    const partition = pickPartition(storage.partitions(update.key), table, update.key);
    // Write without upserting; data will be synced, but won't be visible until someone upserts
    writeData(partition.doc, table, update.key, update, false);
}

export function remove(storage: DataSource, table: Table<unknown>, key: string) {
    const partition = pickPartition(storage.partitions(key), table, key);
    // Delete from index only for now
    const rows = partition.doc.getMap(table.name);
    rows.delete(key);
}

function pickPartition(partitions: Partition[], table: Table<unknown>, key: string) {
    return partitions[0]!;
}