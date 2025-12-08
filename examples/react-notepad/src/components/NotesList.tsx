import { any, remove, upsert } from '@bensku/y-query';
import { useQuery } from '@bensku/y-query-react';
import { useCallback, useMemo } from 'react';
import * as Y from 'yjs';
import { NotesTable } from '../schema';

interface NotesListProps {
    doc: Y.Doc;
    selectedKey: string | null;
    onSelectNote: (key: string | null) => void;
}

export function NotesList({ doc, selectedKey, onSelectNote }: NotesListProps) {
    const filter = useMemo(() => any(), []);
    const notes = useQuery(doc, NotesTable, filter, 'content');

    const sortedNotes = useMemo(() => {
        return [...notes].sort((a, b) => b.createdAt - a.createdAt);
    }, [notes]);

    const handleCreateNote = useCallback(() => {
        const key = crypto.randomUUID();
        upsert(doc, NotesTable, {
            key,
            title: 'Untitled Note',
            createdAt: Date.now(),
            content: new Y.XmlFragment(),
        });
        onSelectNote(key);
    }, [doc, onSelectNote]);

    const handleDeleteNote = useCallback(
        (e: React.MouseEvent, key: string) => {
            e.stopPropagation();
            remove(doc, NotesTable, key);
            if (selectedKey === key) {
                onSelectNote(null);
            }
        },
        [doc, selectedKey, onSelectNote],
    );

    return (
        <div className="notes-list">
            <div className="notes-list-header">
                <h2>Notes</h2>
                <button
                    onClick={handleCreateNote}
                    className="create-btn"
                    type="button"
                >
                    + New Note
                </button>
            </div>
            <ul className="notes-items">
                {sortedNotes.map((note) => (
                    <li
                        key={note.key}
                        className={`note-item ${selectedKey === note.key ? 'selected' : ''}`}
                        onClick={() => onSelectNote(note.key)}
                        onKeyUp={() => onSelectNote(note.key)}
                    >
                        <div className="note-info">
                            <span className="note-title">
                                {note.title || 'Untitled'}
                            </span>
                            <span className="note-date">
                                {new Date(note.createdAt).toLocaleDateString()}
                            </span>
                        </div>
                        <button
                            className="delete-btn"
                            onClick={(e) => handleDeleteNote(e, note.key)}
                            title="Delete note"
                            type="button"
                        >
                            Delete
                        </button>
                    </li>
                ))}
            </ul>
            {notes.length === 0 && (
                <p className="empty-state">
                    No notes yet. Create your first note!
                </p>
            )}
        </div>
    );
}
