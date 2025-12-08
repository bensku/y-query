import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { App } from './App';
import { RoomDialog } from './components/RoomDialog';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import './styles.css';

interface Connection {
    doc: Y.Doc;
    provider: HocuspocusProvider;
    roomName: string;
}

function Root() {
    const [connection, setConnection] = useState<Connection | null>(null);
    const [synced, setSynced] = useState(false);

    const handleConnect = (roomName: string) => {
        const doc = new Y.Doc();
        const provider = new HocuspocusProvider({
            url: 'ws://localhost:1234',
            name: roomName,
            document: doc,
            onSynced: ({ state }) => {
                console.log('Sync state:', state);
                setSynced(state);
            },
            onConnect: () => {
                console.log('Connected to server');
            },
            onDisconnect: () => {
                console.log('Disconnected from server');
                setSynced(false);
            },
        });
        setConnection({ doc, provider, roomName });
    };

    useEffect(() => {
        return () => {
            if (connection) {
                connection.provider.destroy();
                connection.doc.destroy();
            }
        };
    }, [connection]);

    if (!connection) {
        return <RoomDialog onConnect={handleConnect} />;
    }

    if (!synced) {
        return (
            <div className="room-dialog-overlay">
                <div className="room-dialog">
                    <h2>Connecting...</h2>
                    <p>Syncing with room: {connection.roomName}</p>
                </div>
            </div>
        );
    }

    return (
        <App
            doc={connection.doc}
            provider={connection.provider}
            roomName={connection.roomName}
        />
    );
}

// biome-ignore lint/style/noNonNullAssertion: static part of index.html
createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Root />
    </StrictMode>,
);
