import * as Y from 'yjs';
import type { Table } from './table';
import { readData } from './yjs-types';

export interface Partition {
    id: string;
    doc: Y.Doc;
}

export class View {
    #partitionSource: (key?: string) => Partition[];

    constructor(partitionSource: (key?: string) => Partition[]) {
        this.#partitionSource = partitionSource;
    }

    get<T>(table: Table<T>, key: string): T | null {
        // Give key to partition source so that it can (maybe) guess the partition
        const partitions = this.#partitionSource(key);
        // In case it doesn't, we'll need to scan through multiple partitions
        for (const partition of partitions) {
            // TODO consider if caching maps would benefit performance
            const map = partition.doc.getMap(table.name);
            const value = map.get(key);
            if (value !== undefined && value !== null) {
                return readData(value, key, table.type);
            }
        }

        return null; // Didn't the key in any of partitions
    }
}
