import * as Y from 'yjs';
import * as z from 'zod';
import type { Table } from './table';

export function readData<T>(doc: Y.Doc, table: Table<T>, key: string): T | null {
    const rows = doc.getMap(table.name);
    const present = rows.has(key);
    return present ? readObject(doc, `${table.name}.${key}`, table.type) : null;
}

function readObject<T>(doc: Y.Doc, key: string, type: z.ZodType<T> & z.ZodObject): T {
    const row = doc.getMap(key);
    const data: Record<string, unknown> = {};
    for (const [field, t] of Object.entries(type.shape)) {
        let value;

        // Figure out where the field's value is actually stored
        const syncAs = z.globalRegistry.get(t)?.syncAs;
        if (syncAs) {
            // Separate key in Y.Doc - avoids last-writer-wins for replicated types
            if (syncAs == Y.Map && t.type == 'object') {
                // But we need to convert it to plain JS object
                // Since it, too, might have nested Yjs objects, we need to do this recursively
                value = readObject(doc, `${key}.${field}`, type);
            } else {
                // And we should present it as Yjs type
                value = doc.get(`${key}.${field}`, syncAs as any); // TODO type checks
            }
        } else {
            // As-is. Strings, booleans, whatever else
            value = row.get(field);
        }
        data[field] = value;
    }
    if ('key' in type.shape) {
        data.key = key;
    }
    return type.parse(data);
}

export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;


export function writeData<T>(doc: Y.Doc, table: Table<T>, key: string, value: T | DeepPartial<T>, upsert: boolean) {
    doc.transact(() => {
        writeObject(doc, `${table.name}.${key}`, value as Record<string, unknown>, table.type);
        if (upsert) {
            doc.getMap(table.name).set(key, true);
        }
    });
}

function writeObject(doc: Y.Doc, key: string, data: Record<string, unknown>, type: z.ZodObject) {
    if ('key' in data) {
        delete data.key;
    }

    const row = doc.getMap(key);
    for (const [field, t] of Object.entries(type.shape)) {
        const value = data[field];
        if (value === undefined) {
            continue; // Not specified, don't update existing value
        }

        // Figure out where the field's value is actually stored
        const syncAs = z.globalRegistry.get(t)?.syncAs;
        if (syncAs) {
            // Separate key in Y.Doc - avoids last-writer-wins for replicated types
            if (syncAs == Y.Map && t.type == 'object') {
                // Merge changes from plain JS to Y.Map
                writeObject(doc, `${key}.${field}`, data[field] as any, t); // TODO type checks?
            } // else: do not write, it is already a replicated type
        } else {
            // Write non-synced data as-it-is, with last-writer-wins semantics
            row.set(field, value);
        }
    }
}