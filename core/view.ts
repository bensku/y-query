import * as Y from 'yjs';
import type { Table } from './table';
import { allKeys, getRow, observeKeys, readData, readDataPresent } from './yjs-types';

/**
 * Gets a row by its key.
 * 
 * Note that syncing rows between Yjs peers can take a while!
 * @param doc Database to operate on.
 * @param table Table to read from.
 * @param key Row key.
 * @returns The row if it is present, or null otherwise.
 */
export function getKey<T>(doc: Y.Doc, table: Table<T>, key: string): T | null {
    return readData(doc, table, key);
}

/**
 * Selects rows that match the given query from a table.
 * @param doc Database to operate on.
 * @param table Table to read from.
 * @param query Query that the rows are evaluated against.
 * @returns A list of rows that match the given query. Empty list if none do.
 */
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

/**
 * Watches for changes in rows that match the given query.
 * @param doc Database to operate on.
 * @param table Table to read from.
 * @param query Query that the rows are evaluated against.
 * @param level Watcher change detection level.
 * 'keys' detects only newly added or removed rows. 'content' detects
 * changes in row content, excluding nested objects. 'deep' detects changes
 * in row content, including nested objects (including raw shared types).
 * Typically, you'll probably want 'content' or possibly 'keys'.
 * @param watcher Watcher function. When the observed rows change,
 * this is called with lists of changed rows. Added and changed rows are
 * provided in their current shapes, while removed rows are in the state
 * immediately before their removal. Note that changes that cause rows no
 * longer match the given query are considered removals for watcher!
 * @returns A function that, when called, unregisters the given watcher.
 */
export function watch<T>(doc: Y.Doc, table: Table<T>, query: Filter<T>, level: 'keys' | 'content' | 'deep',
        watcher: (added: T[], removed: T[], changed: T[]) => void): () => void {
    const visibleData: Map<string, T> = new Map();
    
    const rowUnobservers: Map<string, (() => void)> = new Map();
    const observeRow = (row: Y.Map<unknown>, key: string, deep: boolean) => {
        const rowWatcher = () => {
            if (!query(row)) {
                // Row was changed in a way that it no longer falls within our query!
                const unobserver = rowUnobservers.get(key);
                if (unobserver) {
                    unobserver();
                }

                // If data was visible, notify watcher that it was removed
                const data = visibleData.get(key);
                if (data) {
                    visibleData.delete(key);
                    watcher([],  [data], []);
                }
                return;
            }

            const data = readDataPresent(doc, table, key);
            if (data) {
                // Content changed! Notify watcher
                watcher([], [], [data]);
                visibleData.set(key, data); // And make sure watcher gets up-to-date data on removal
            } // else: incompletely synced changes violate schema; wait for sync to complete
        };
        if (deep) {
            row.observeDeep(rowWatcher);
        } else {
            row.observe(rowWatcher);
        }
        rowUnobservers.set(key, () => {
            if (deep) {
                row.unobserveDeep(rowWatcher);
            } else {
                row.unobserve(rowWatcher);
            }
        });
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
                    observeRow(row, key, watchDeep);
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

            // If we were observing the row, quit doing so
            const unobserve = rowUnobservers.get(key);
            if (unobserve) {
                unobserve();
            }
        }

        // Notify watcher about additions and removals
        if (added.length != 0 || removed.length != 0) {
            watcher(added, removed, []);
        }
    }
    const unobserveTable = observeKeys(doc, table, handler);

    // Find initial set of keys and pass it to callback
    const [initialRows] = addRows(allKeys(doc, table));
    if (initialRows.length != 0) {
        watcher(initialRows, [], []);
    }

    // Return function that unobserves everything we observe
    return () => {
        unobserveTable();
        rowUnobservers.forEach(func => func());
    }
}

type Filter<T> = (row: Y.Map<unknown>) => boolean;

/**
 * Accepts any row.
 */
export function any<T>() {
    return () => true;
}

/**
 * Accepts rows that have the given value.
 * @param key Key in row.
 * @param value Expected value.
 */
export function eq<T, K extends keyof T & string>(key: K, value: T[K]): Filter<T> {
    return (row) => row.get(key) == value;
}

/**
 * Accepts rows that are rejected by the given filter.
 * @param filter NOT filter.
 */
export function not<T>(filter: Filter<T>): Filter<T> {
    return (row) => !filter(row);
}

/**
 * Accepts rows that are accepted by all given filters.
 * @param filters AND filters.
 */
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

/**
 * Accepts rows that are accepted by at least one of the given filters.
 * @param filters OR filters.
 */
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
