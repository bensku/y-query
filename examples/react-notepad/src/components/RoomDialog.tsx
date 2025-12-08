import { useState, type FormEvent } from 'react';

interface RoomDialogProps {
    onConnect: (roomName: string) => void;
}

export function RoomDialog({ onConnect }: RoomDialogProps) {
    const [roomName, setRoomName] = useState('');

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (roomName.trim()) {
            onConnect(roomName.trim());
        }
    };

    return (
        <div className="room-dialog-overlay">
            <div className="room-dialog">
                <h2>Join Collaborative Notepad</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="roomName">Room Name</label>
                        <input
                            id="roomName"
                            type="text"
                            value={roomName}
                            onChange={(e) => setRoomName(e.target.value)}
                            placeholder="Enter room name"
                            required
                        />
                    </div>
                    <button type="submit" disabled={!roomName.trim()}>
                        Join Room
                    </button>
                </form>
                <p className="hint">
                    Users in the same room will see each other's changes in
                    real-time.
                </p>
            </div>
        </div>
    );
}
