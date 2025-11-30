import * as Y from 'yjs';
import * as z from 'zod';

export interface Table<T> {
    name: string;
    type: z.ZodType<T> & z.ZodObject;
}

export type Row<T extends Table<unknown>> = z.output<T['type']>;

export function table<T>(name: string, type: z.ZodType<T> & z.ZodObject): Table<T> {
    return {
        name,
        type
    }
}
