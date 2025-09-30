import type { DataSource } from "./storage";
import type { Table } from "./table";
import { writeData } from "./yjs-types";

export function insert<T>(storage: DataSource, table: Table<T>, entry: Omit<NonNullable<T>, 'key'>, prefix?: string): string {
    // TODO do we want same partition API for both read and write paths?
    const partitions = storage.partitions(prefix);
    const key = prefix ? `${prefix}${crypto.randomUUID()}` : crypto.randomUUID();
    
    const tableMap = partitions[0]!.doc.getMap(table.name);
    writeData(tableMap, key, entry, table.type);
    return key;
}

export function update<T>(storage: DataSource, table: Table<T>, changes: NonNullable<Partial<T>> & { key: string }): void {
    const partitions = storage.partitions(changes.key);
    const tableMap = partitions[0]!.doc.getMap(table.name);
    writeData(tableMap, changes.key, changes, table.type);

}

export function remove(storage: DataSource, table: Table<unknown>, key: string) {
    const partitions = storage.partitions(key);
    const tableMap = partitions[0]!.doc.getMap(table.name);
    tableMap.delete(key);
}