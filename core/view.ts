import * as Y from 'yjs';
import type { Table } from './table';
import { allKeys, getRow, observeKeys, readData, readDataPresent } from './yjs-types';

export function getKey<T>(doc: Y.Doc, table: Table<T>, key: string): T | null {
    return readData(doc, table, key);
}

export function select<T>(doc: Y.Doc, table: Table<T>, query: Filter<T>): T[] {
    const results: T[] = [];
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

    return results;
}

export function watch<T>(doc: Y.Doc, table: Table<T>, query: Filter<T>, watcher: (added: T[], removed: T[], changed: T[]) => void,
        level: 'keys' | 'content' | 'deep'): () => void {
    const visibleData: Map<string, T> = new Map();
    
    const rowUnobservers: Map<string, (() => void)> = new Map();
    const observeRow = (row: Y.Map<unknown>, key: string, deep: boolean, changeAsAddition: boolean) => {
        const rowWatcher = () => {
            const data = readDataPresent(doc, table, key);
            if (data) {
                // Content changed! Notify watcher
                row.unobserveDeep(rowWatcher);
                if (changeAsAddition) {
                    // We were waiting for initial sync to finish, so track this as addition
                    watcher([data], [], []);
                    visibleData.set(key, data);
                } else {
                    // Just normal change
                    watcher([], [], [data]);
                }
            } // else: incompletely synced changes violate schema; wait for sync to complete
        };
        if (deep) {
            row.observeDeep(rowWatcher);
        } else {
            row.observe(rowWatcher);
        }
        rowUnobservers.set(key, rowWatcher);
    }

    const watchContent = level == 'content' || level == 'deep';
    const watchDeep = level == 'deep';
    const addRows = (addedKeys: Iterable<string>): [T[], string[]] => {
        const added: T[] = [];
        const removedKeys: string[] = []; // Removed = changed not to match the query anymore
        for (const key of addedKeys) {
            const row = getRow(doc, table, key);
            if (!query(row)) {
                removedKeys.push(key);
                continue; // Query shouldn't return anything about this key
            }

            const data = readDataPresent(doc, table, key);
            if (data) {
                // Row is complete, notify the watcher immediately
                added.push(data);
                visibleData.set(key, data); // And remember to track this row's removal

                // If requested, watch for changes in the row content
                if (watchContent) {
                    observeRow(row, key, watchDeep, false);
                }
            } else {
                // Row is incompletely replicated and currently violates schema
                // TODO consider that there might be other reasons for schema violations
                // Watch it deeply until it becomes valid, then try addKeys again!
                const rowWatcher = () => {
                    const data = readDataPresent(doc, table, key);
                    if (data) {
                        // Row is complete, quit observing and notify watcher!
                        addRows([key]);
                    } // else: still incomplete
                };
                row.observeDeep(rowWatcher);
                rowUnobservers.set(key, rowWatcher);
            }
        }
        return [added, removedKeys];
    };

    // Observe key changes in all partitions
    const handler = (addedKeys: string[], removedKeys: string[]) => {
        // Look up and parse added rows
        const [added, changedToRemoveKeys] = addRows(addedKeys);

        // Purge removed keys from cache
        const removed: T[] = [];
        for (const key of [...removedKeys, ...changedToRemoveKeys]) {
            const data = visibleData.get(key);
            if (data) {
                removed.push(data);
                visibleData.delete(key);
            } // else: it was never visible to watcher (due to e.g. query ignoring it) -> so do nothing
        }

        // Notify watcher about additions and removals
        watcher(added, removed, []);
    }
    const unobserveTable = observeKeys(doc, table, handler);

    // Find initial set of keys and pass it to callback
    const [initialRows] = addRows(allKeys(doc, table));
    watcher(initialRows, [], []);

    // Return function that unobserves everything we observe
    return () => {
        unobserveTable();
        rowUnobservers.forEach(func => func());
    }
}

type Filter<T> = (row: Y.Map<unknown>) => boolean;

export function any<T>() {
    return () => true;
}

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
