import json
import logging
from typing import List, Dict, Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Total active connections: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]):
        """
        Broadcast a dictionary message to all connected clients.
        """
        if not self.active_connections:
            return

        message_str = json.dumps(message)
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message_str)
            except Exception as e:
                logger.warning(f"Error broadcasting message to connection: {e}")
                disconnected.append(connection)

        # Cleanup any broken connections
        for conn in disconnected:
            self.disconnect(conn)

# Global singleton WebSocket manager
websocket_manager = WebSocketManager()
