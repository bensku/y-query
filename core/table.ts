import * as Y from 'yjs';
import * as z from 'zod';

export interface Table<T> {
    name: string;
    type: z.ZodType<T>;
}

export function table(name: string, type: z.ZodType) {
    return {
        name,
        type
    }
}