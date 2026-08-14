const WebSocket = require("ws");

const PORT = 8080;

// Create WebSocket server
const wss = new WebSocket.Server({
  port: PORT,
  host: "0.0.0.0"
});

console.log(`WebSocket server running on ws://0.0.0.0:${PORT}`);

wss.on("connection", (ws, req) => {
  console.log("ESP32 connected");

  ws.on("message", message => {
    try {
      const data = JSON.parse(message.toString());

      if (data.uid) {
        console.log("Received UID from ESP32:", data.uid);
      } else {
        console.log("Received message:", data);
      }
    } catch (err) {
      console.log("Invalid message:", message.toString());
    }
  });

  ws.on("close", () => {
    console.log("ESP32 disconnected");
  });
});