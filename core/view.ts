import type * as Y from 'yjs';
import type { Table, TableBase } from './table';
import {
    allKeys,
    getRow,
    observeKeys,
    readData,
    readDataPresent,
} from './yjs-types';

/**
 * Gets a row by its key.
 *
 * Note that syncing rows between Yjs peers can take a while!
 * @param doc Database to operate on.
 * @param table Table to read from.
 * @param key Row key.
 * @returns The row if it is present, or null otherwise.
 */
export function getKey<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    key: string,
): T | null {
    return readData(doc, table, key);
}

/**
 * Selects rows that match the given query from a table.
 * @param doc Database to operate on.
 * @param table Table to read from.
 * @param query Query that the rows are evaluated against.
 * @returns A list of rows that match the given query. Empty list if none do.
 */
export function select<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    query: Filter<T>,
): T[] {
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

export type WatchLevel = 'keys' | 'content' | 'deep';

export interface Subscription<T> {
    /**
     * Stops watching for events.
     */
    unwatch: () => void;

    /**
     * Currently visible rows by their keys. This map is mutated by y-query.
     * It is guaranteed to be up-to-date when the associated watching function
     * has been called.
     *
     * Note that the changes are also passed to the watcher function. Unless
     * you're integrating a framework such as React, it is probably a better
     * idea to use those.
     */
    visibleData: Map<string, T>;
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
 * As last argument, all watched rows are probided as a mutable Map.
 * Unless you're integrating a framework such as React, you will probably
 * not need this.
 * @returns Function that, when called, stops this watch operation.
 */
export function watch<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    query: Filter<T>,
    level: WatchLevel,
    watcher: (
        added: T[],
        removed: T[],
        changed: T[],
        visibleData: Map<string, T>,
    ) => void,
): () => void {
    const visibleData: Map<string, T> = new Map();

    const rowUnobservers: Map<string, () => void> = new Map();
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
                    watcher([], [data], [], visibleData);
                }
                return;
            }

            const data = readDataPresent(doc, table, key);
            if (data) {
                // Content changed! Notify watcher
                visibleData.set(key, data); // But make sure visible data is up-to-date before
                watcher([], [], [data], visibleData);
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
    };

    const watchContent = level === 'content' || level === 'deep';
    const watchDeep = level === 'deep';
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
        if (added.length !== 0 || removed.length !== 0) {
            watcher(added, removed, [], visibleData);
        }
    };
    const unobserveTable = observeKeys(doc, table, handler);

    // Find initial set of keys and pass it to callback
    const [initialRows] = addRows(allKeys(doc, table));
    if (initialRows.length !== 0) {
        watcher(initialRows, [], [], visibleData);
    }

    // Return subscription that allows e.g. unobserving everything
    return () => {
        unobserveTable();
        rowUnobservers.forEach((func) => void func());
    };
}

/**
 * Watches for changes in a single row.
 * @param doc Database to operate on.
 * @param table Table to read from.
 * @param key Row key.
 * @param level Watch level. If 'keys', the watcher is called when a row with
 * this key is added or removed. If 'content' or 'deep', the watcher is also
 * alerted about changes in row content (shallowly or deeply, respectively).
 * @param watcher Watcher function. This is called with the row's current
 * value when it changes, which can be null if the row (no longer) exists.
 * @returns Function that, when called, stops this watch operation.
 */
export function watchKey<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    key: string,
    level: WatchLevel,
    watcher: (newValue: T | null) => void,
): () => void {
    let unobserveRow: (() => void) | null = null;
    const observeRow = (row: Y.Map<unknown>) => {
        const rowWatcher = () => {
            const data = readDataPresent(doc, table, key);
            if (data) {
                // Content changed! Notify watcher
                watcher(data);
            } // else: incompletely synced changes violate schema; wait for sync to complete
        };
        if (level === 'deep') {
            row.observeDeep(rowWatcher);
        } else {
            row.observe(rowWatcher);
        }
        unobserveRow = () => {
            if (level === 'deep') {
                row.unobserveDeep(rowWatcher);
            } else {
                row.unobserve(rowWatcher);
            }
        };
    };

    // Watch for addition/removal of this key
    const unobserveKeys = observeKeys(doc, table, (added, removed) => {
        if (added.includes(key)) {
            // Row appeared! If it has been fully synced, notify now!
            const row = readDataPresent(doc, table, key);
            if (row) {
                watcher(row);
            }
            // Also watch for changes in its content
            if (unobserveRow === null) {
                observeRow(getRow(doc, table, key));
            }
        } else if (removed.includes(key)) {
            // Row disappeared, notify about that
            watcher(null);
        }
    });

    // If desired, observe content changes
    if (level === 'content' || level === 'deep') {
        observeRow(getRow(doc, table, key));
    }
    // Finally, let the watcher know about row's current value (which may well be null)
    watcher(readData(doc, table, key));

    // Return function that unwatches the key
    return () => {
        unobserveKeys();
        if (unobserveRow) {
            unobserveRow();
        }
    };
}

export type Filter<_T> = (row: Y.Map<unknown>) => boolean;

/**
 * Accepts any row.
 */
export function any<_T>() {
    return () => true;
}

/**
 * Accepts rows that have the given value.
 * @param key Key in row.
 * @param value Expected value.
 */
export function eq<T, K extends keyof T & string>(
    key: K,
    value: T[K],
): Filter<T> {
    return (row) => row.get(key) === value;
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
    };
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
    };
}
