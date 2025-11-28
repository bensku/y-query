import * as Y from 'yjs';
import type { Table } from './table';
import { allKeys, getRow, observeKeys, readData, readDataPresent, readObject } from './yjs-types';

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
            const value = readData(partition.doc, table, key);
            if (value) {
                return value;
            }
        }

        return null; // Didn't the key in any of partitions
    }

    select<T>(table: Table<T>, query: Filter<T>): T[] {
        const partitions = this.#partitionSource(); // No key available, scan all

        const results: T[] = [];
        for (const partition of partitions) {
            const doc = partition.doc;
            for (const key of allKeys(doc, table)) {
                const row = getRow(doc, table, key);
                if (query(row)) {
                    // TODO we use getMap() again here... but hopefully it won't matter
                    const data = readDataPresent(doc, table, key);
                    if (data) {
                        results.push(data);
                    } // else: row has not been fully replicated to us yet, so skip it
                }
            }
        }

        return results;
    }

    watch<T>(table: Table<T>, query: Filter<T>, watcher: (added: T[], removed: T[]) => void,
            level: 'keys' | 'content' | 'deep'): () => void {
        const partitions = this.#partitionSource();

        const visibleData: Map<string, T> = new Map();
        const tableUnobservers: (() => void)[] = [];
        const rowUnobservers: Map<string, (() => void)> = new Map();
        // TODO content and deep watch levels

        // Observe key changes in all partitions
        for (const partition of partitions) {
            const doc = partition.doc;
            const handler = (addedKeys: string[], removedKeys: string[]) => {
                // Look up and parse added rows
                const added: T[] = [];
                for (const key of addedKeys) {
                    const row = getRow(doc, table, key);
                    if (!query(row)) {
                        continue; // Query shouldn't return anything about this key
                    }

                    const data = readDataPresent(doc, table, key);
                    if (data) {
                        // Row is complete, notify the watcher
                        added.push(data);
                        visibleData.set(key, data); // And cache it for future (potential) removal
                    } else {
                        // Row is incompletely replicated, i.e. won't parse
                        // Subscribe to changes until it is completely replicated
                        // TODO benchmark?
                        const rowWatcher = () => {
                            const data = readDataPresent(doc, table, key);
                            if (data) {
                                // Row is complete, quit observing and notify watcher!
                                row.unobserveDeep(rowWatcher);
                                watcher([data], []);
                                visibleData.set(key, data);
                            } // else: still incomplete
                        };
                        row.observeDeep(rowWatcher);
                    }
                }

                // Purge removed keys from cache
                const removed: T[] = [];
                for (const key of removedKeys) {
                    const data = visibleData.get(key);
                    if (data) {
                        removed.push(data);
                        visibleData.delete(key);
                    } // else: it was never visible to watcher (due to e.g. query ignoring it) -> so do nothing
                }
            }
            tableUnobservers.push(observeKeys(doc, table, handler));
        }

        // Find initial set of keys and pass it to callback
        watcher(this.select(table, query), []);

        // Return function that unobserves everything we observe
        // TODO also unobserve rowWatchers, if any are present
        return () => {
            for (const func of tableUnobservers) {
                func();
            }
        }
    }
}

type Filter<T> = (row: Y.Map<unknown>) => boolean;

export function eq<T, K extends keyof T & string>(key: K, value: T[K]): Filter<T> {
    return (row) => row.get(key) == value;
}

export function not<T>(filter: Filter<T>): Filter<T> {
    return (row) => !filter(row);
}

export function and<T>(...filters: Filter<T>[]): Filter<T> {
    return (row) => {
        for (const filter of filters) {
            if (!filter(row)) {
                return false;
            }
        }
        return true;
    }
}

export function or<T>(...filters: Filter<T>[]): Filter<T> {
    return (row) => {
        for (const filter of filters) {
            if (filter(row)) {
                return true;
            }
        }
        return false;
    }
}

type Operator = 'equal' | 'notEqual';

interface Query<T, K extends keyof T> {
    key: K;
    operator: Operator;
    value: T[K];
}
