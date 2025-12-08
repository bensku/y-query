import { update } from '@bensku/y-query';
import { useRow } from '@bensku/y-query-react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useCallback, useMemo } from 'react';
import type * as Y from 'yjs';
import { NotesTable } from '../schema';

interface NoteEditorProps {
    doc: Y.Doc;
    provider: HocuspocusProvider;
    noteKey: string;
}

function getRandomColor(): string {
    const colors = [
        '#FF6B6B',
        '#4ECDC4',
        '#45B7D1',
        '#96CEB4',
        '#FFEAA7',
        '#DDA0DD',
        '#98D8C8',
        '#F7DC6F',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

export function NoteEditor({ doc, provider, noteKey }: NoteEditorProps) {
    const note = useRow(doc, NotesTable, noteKey, 'content');

    const userInfo = useMemo(
        () => ({
            name: `User-${Math.floor(Math.random() * 1000)}`,
            color: getRandomColor(),
        }),
        [],
    );

    const editor = useCreateBlockNote(
        {
            collaboration: note
                ? {
                      provider,
                      fragment: note.content,
                      user: userInfo,
                  }
                : undefined,
        },
        [note, provider, userInfo],
    );

    const handleTitleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const newTitle = e.target.value;
            update(doc, NotesTable, {
                key: noteKey,
                title: newTitle,
            });
        },
        [doc, noteKey],
    );

    if (!note) {
        return <div className="editor-loading">Loading note...</div>;
    }

    return (
        <div className="note-editor">
            <input
                type="text"
                className="note-title-input"
                value={note.title}
                onChange={handleTitleChange}
                placeholder="Note title"
            />
            <div className="blocknote-wrapper">
                <BlockNoteView editor={editor} />
            </div>
        </div>
    );
}
