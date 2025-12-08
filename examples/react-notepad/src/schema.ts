import { table } from '@bensku/y-query';
import * as Y from 'yjs';
import z from 'zod';

export const NotesTable = table(
    'notes',
    z.object({
        key: z.string(),
        title: z.string(),
        createdAt: z.number(),
        content: z.instanceof(Y.XmlFragment).meta({ syncAs: Y.XmlFragment }),
    }),
);

export type Note = z.output<typeof NotesTable.type>;
