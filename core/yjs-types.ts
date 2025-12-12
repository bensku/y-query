import * as Y from 'yjs';
import * as z from 'zod';
import type { Table, TableBase } from './table';

export function readData<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    key: string,
): T | null {
    const rows = doc.getMap(table.name);
    const present = rows.has(key);
    return present
        ? readObject(doc, `${table.name}.${key}`, table.type, key)
        : null;
}

export function readDataPresent<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    key: string,
): T | null {
    return readObject(doc, `${table.name}.${key}`, table.type, key);
}

function readObject<T>(
    doc: Y.Doc,
    key: string,
    type: z.ZodType<T> & z.ZodObject,
    userKey?: string,
): T | null {
    const row = doc.getMap(key);
    const data: Record<string, unknown> = {};
    for (const [field, t] of Object.entries(type.shape)) {
        let value: unknown;

        // Figure out where the field's value is actually stored
        const meta = z.globalRegistry.get(t);
        const syncAs = meta?.syncAs;
        const shallow = meta?.shallow === true;

        // Auto-infer syncAs: Y.Map for nested z.object() and z.discriminatedUnion() unless shallow: true
        const isNestedObject = t.type === 'object';
        const isUnion = t instanceof z.ZodDiscriminatedUnion;
        const shouldSyncAsMap =
            (syncAs === Y.Map || (!syncAs && (isNestedObject || isUnion))) &&
            !shallow;

        if (shouldSyncAsMap && isUnion) {
            // Discriminated union stored in separate Y.Map
            value = readUnion(doc, `${key}.${field}`, t);
            if (value == null) {
                return null; // Inner union not yet fully replicated
            }
        } else if (shouldSyncAsMap && isNestedObject) {
            // Nested object stored in separate Y.Map - convert to plain JS object
            // Since it, too, might have nested Yjs objects, we need to do this recursively
            value = readObject(doc, `${key}.${field}`, t);
            if (value == null) {
                // Inner object not yet fully replicated
                return null; // Entire row must match schema for us to return it
            }
        } else if (syncAs) {
            // Raw Yjs type (Y.XmlFragment, Y.Array, etc.) - present as-is
            value = doc.get(`${key}.${field}`, syncAs as any); // TODO type checks
        } else {
            // As-is. Strings, booleans, whatever else (or shallow nested objects)
            value = row.get(field);
        }
        data[field] = value;
    }
    if (userKey && 'key' in type.shape) {
        data.key = userKey;
    }

    // Assume errors are just data that hasn't been fully replicated here
    // and do not return them
    const parsed = type.safeParse(data);
    return parsed.success ? parsed.data : null;
}

function readUnion(
    doc: Y.Doc,
    key: string,
    type: z.ZodDiscriminatedUnion,
): Record<string, unknown> | null {
    const map = doc.getMap(key);

    const discriminator = type.def.discriminator;
    const options = type.options as z.ZodObject[];

    const discriminatorValue = map.get(discriminator);
    if (discriminatorValue === undefined) {
        return null; // Not yet replicated
    }

    // Find the matching variant by checking each option's shape
    // TODO optimize? This is probably inefficient for LARGE numbers of cases
    const variantSchema = options.find((opt) => {
        const literalType = opt.shape[discriminator];
        if (literalType instanceof z.ZodLiteral) {
            return literalType.value === discriminatorValue;
        }
        return false;
    });

    if (!variantSchema) {
        return null; // Invalid discriminator value
    }

    // Read the variant as an object
    return readObject(doc, key, variantSchema);
}

export type DeepPartial<T> = T extends object
    ? {
          [P in keyof T]?: DeepPartial<T[P]>;
      }
    : T;

export function writeData<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    key: string,
    value: T | DeepPartial<T>,
    upsert: boolean,
) {
    doc.transact(() => {
        writeObject(
            doc,
            `${table.name}.${key}`,
            value as Record<string, unknown>,
            table.type,
        );
        if (upsert) {
            doc.getMap(table.name).set(key, true);
        }
    });
}

function writeObject(
    doc: Y.Doc,
    key: string,
    data: Record<string, unknown>,
    type: z.ZodObject,
) {
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
        const meta = z.globalRegistry.get(t);
        const syncAs = meta?.syncAs;
        const shallow = meta?.shallow === true;

        // Auto-infer syncAs: Y.Map for nested z.object() and discriminatedUnion unless shallow: true
        const isNestedObject = t.type === 'object';
        const isUnion = t instanceof z.ZodDiscriminatedUnion;
        const shouldSyncAsMap =
            (syncAs === Y.Map || (!syncAs && (isNestedObject || isUnion))) &&
            !shallow;

        if (shouldSyncAsMap && isUnion) {
            // Discriminated union stored in separate Y.Map
            writeUnion(
                doc,
                `${key}.${field}`,
                data[field] as Record<string, unknown>,
                t,
            );
        } else if (shouldSyncAsMap && isNestedObject) {
            // Nested object stored in separate Y.Map - merge changes recursively
            writeObject(doc, `${key}.${field}`, data[field] as any, t); // TODO type checks?
        } else if (syncAs) {
            // Raw Yjs type - do not write, it is already a replicated type
        } else {
            // Write non-synced data as-it-is, with last-writer-wins semantics
            row.set(field, value);
        }
    }
}

function writeUnion(
    doc: Y.Doc,
    key: string,
    data: Record<string, unknown>,
    type: z.ZodDiscriminatedUnion,
) {
    const discriminator = type.def.discriminator as string;
    const options = type.options as z.ZodObject[];

    const discriminatorValue = data[discriminator];

    // Find the matching variant by checking each option's shape
    // TODO optimize? This is probably inefficient for LARGE numbers of cases
    const variantSchema = options.find((opt) => {
        const literalType = opt.shape[discriminator];
        if (literalType instanceof z.ZodLiteral) {
            return literalType.value === discriminatorValue;
        }
        return false;
    });

    if (variantSchema) {
        // Write using the variant's object schema
        writeObject(doc, key, data, variantSchema);
    }
}

/**
 * Determines if a Zod type should be synced as a separate Y.Map.
 * Returns true for z.object(), z.discriminatedUnion() fields (unless marked shallow),
 * and explicit syncAs: Y.Map.
 */
export function shouldSyncAsYMap(t: z.ZodType): boolean {
    const meta = z.globalRegistry.get(t);
    const syncAs = meta?.syncAs;
    const shallow = meta?.shallow === true;
    const isNestedObject = t instanceof z.ZodObject;
    const isUnion = t instanceof z.ZodDiscriminatedUnion;
    return (
        ((syncAs === Y.Map && isNestedObject) ||
            (!syncAs && (isNestedObject || isUnion))) &&
        !shallow
    );
}

/**
 * Determines if a Zod type is a raw Yjs shared type (not a converted z.object()).
 */
export function isRawYjsType(t: z.ZodType): boolean {
    const meta = z.globalRegistry.get(t);
    const syncAs = meta?.syncAs;
    const isNestedObject = t instanceof z.ZodObject;
    return syncAs != null && !(syncAs === Y.Map && isNestedObject);
}

export function getRow<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    key: string,
): Y.Map<unknown> {
    return doc.getMap(`${table.name}.${key}`);
}

export function allKeys<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
): IterableIterator<string> {
    return doc.getMap(table.name).keys();
}

export function observeKeys<T extends TableBase>(
    doc: Y.Doc,
    table: Table<T>,
    callback: (added: string[], removed: string[]) => void,
) {
    const handler = (event: Y.YMapEvent<unknown>) => {
        const added: string[] = [];
        const removed: string[] = [];
        event.changes.keys.forEach((change, key) => {
            if (change.action === 'add') {
                added.push(key);
            } else if (change.action === 'delete') {
                removed.push(key);
            }
        });
        if (added.length !== 0 || removed.length !== 0) {
            callback(added, removed);
        }
    };
    doc.getMap(table.name).observe(handler);
    return () => doc.getMap(table.name).unobserve(handler);
}
