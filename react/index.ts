import {
    type Filter,
    type Table,
    type TableBase,
    type WatchLevel,
    watch,
    watchKey,
} from '@bensku/y-query';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';

/**
 * Subscribes to latest y-query query results.
 * @param doc Database.
 * @param table Table in database to query.
 * @param query The query itself. This MUST be stable, so if it is dynamically
 * constructed inside React components, remember to use e.g. useCallback()!
 * @param level Watch level. 'content' level is a good default.
 * @returns View of rows that match the given query.
 */
export function useQuery<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    query: Filter<T>,
    level: WatchLevel,
): T[] {
    const snapshotRef = useRef<T[]>([]);

    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            const unwatch = watch(
                doc,
                table,
                query,
                level,
                (_added, _removed, _changed, visibleData) => {
                    snapshotRef.current = Array.from(
                        visibleData.values() ?? [],
                    );
                    onStoreChange();
                },
            );
            // watch() will immediately and synchronously call the above callback with initial data
            return unwatch;
        },
        [doc, table, query, level],
    );

    return useSyncExternalStore(subscribe, () => snapshotRef.current);
}

/**
 * Subscribes to changes in one row.
 * @param doc Database.
 * @param table Table in database to query.
 * @param key Row key.
 * @param level Watch level. 'content' level is a good default.
 * @returns The row, possibly null if it doesn't (yet) exist.
 */
export function useRow<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    key: string,
    level: WatchLevel,
): T | null {
    const snapshotRef = useRef<T>(null);

    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            const unwatch = watchKey(doc, table, key, level, (newValue) => {
                snapshotRef.current = newValue;
                onStoreChange();
            });
            // watch() will immediately and synchronously call the above callback with initial data
            return unwatch;
        },
        [doc, table, key, level],
    );

    return useSyncExternalStore(subscribe, () => snapshotRef.current);
}
