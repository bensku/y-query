import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useCallback, useState } from 'react';
import type * as Y from 'yjs';
import { NoteEditor } from './components/NoteEditor';
import { NotesList } from './components/NotesList';

interface AppProps {
    doc: Y.Doc;
    provider: HocuspocusProvider;
    roomName: string;
}

export function App({ doc, provider, roomName }: AppProps) {
    const [selectedNoteKey, setSelectedNoteKey] = useState<string | null>(null);

    const handleSelectNote = useCallback((key: string | null) => {
        setSelectedNoteKey(key);
    }, []);

    return (
        <div className="app">
            <header className="app-header">
                <h1>Collaborative Notepad</h1>
                <span className="room-badge">Room: {roomName}</span>
            </header>
            <div className="app-content">
                <aside className="sidebar">
                    <NotesList
                        doc={doc}
                        selectedKey={selectedNoteKey}
                        onSelectNote={handleSelectNote}
                    />
                </aside>
                <main className="editor-area">
                    {selectedNoteKey ? (
                        <NoteEditor
                            key={selectedNoteKey}
                            doc={doc}
                            provider={provider}
                            noteKey={selectedNoteKey}
                        />
                    ) : (
                        <div className="no-note-selected">
                            <p>
                                Select a note from the sidebar or create a new
                                one
                            </p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
