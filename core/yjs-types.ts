import * as Y from 'yjs';
import * as z from 'zod';

export function readData<T>(value: NonNullable<unknown>, usedKey: string, type: z.ZodType<T>): T | null {
    if (typeof value === 'object') {
        (value as Record<string, unknown>).key = usedKey;
    }

    const convertedValue: Record<string, unknown> = {};
    if (type instanceof z.ZodObject) {
        const sourceRecord = value as Record<string, unknown>;
        for (const [field, t] of Object.entries(type.shape)) {
            convertedValue[field] = sourceRecord[field];
        }
    }

    return type.parse(value);
}

export function writeData(tableMap: Y.Map<unknown>, key: string, value: NonNullable<unknown>, type: z.ZodType<unknown>) {
    // Key is added by readData and shouldn't be written back
    if ('key' in value) {
        delete value.key;
    }

    const update = () => {
        if (type instanceof z.ZodObject) {
            const sourceRecord = value as Record<string, unknown>;
            let targetMap = tableMap.get(key) as Y.Map<unknown>;
            if (!targetMap) {
                // Last writer wins, but hopefully conflicts are pretty rare
                targetMap = new Y.Map();
                tableMap.set(key, targetMap);
            }
            for (const [field, _] of Object.entries(type.shape)) {
                if (!(targetMap.get(field) instanceof Y.AbstractType)) {
                    // Overwrite only non-shared types
                    targetMap.set(field, sourceRecord[field]);
                }
            }
        } // else: the table entries are shared types themself
    }

    const doc = tableMap.doc;
    if (doc) {
        doc.transact(update);
    } else {
        // No doc? Weird, but no excuse to lose writes
        update();
    }
}