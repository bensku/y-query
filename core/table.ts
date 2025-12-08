import * as Y from 'yjs';
import type * as z from 'zod';

export interface TableBase {
    key: string;
}

export interface Table<T extends TableBase> {
    name: string;
    type: z.ZodType<T> & z.ZodObject;
}

export type Row<T extends Table<TableBase>> = z.output<T['type']>;

/**
 * Defines a new y-query table.
 * @param name Name of the table. This MUST be unique, non-unique names may
 * lead to data corruption!
 * @param type Zod object schema for the table rows.
 * @returns A table definition, consumed by most y-query APIs.
 */
export function table<T extends TableBase>(
    name: string,
    type: z.ZodType<T> & z.ZodObject,
): Table<T> {
    return {
        name,
        type,
    };
}
