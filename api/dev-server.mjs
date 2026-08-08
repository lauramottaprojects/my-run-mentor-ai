import http from "node:http";
import handler from "./chat.mjs";

const server = http.createServer((req, res) => handler(req, res));
const port = Number(process.env.PORT) || 8787;
server.listen(port, () => {
  console.log(`My Run Mentor AI API running locally: http://localhost:${port}`);
  console.log(`Health:  GET  http://localhost:${port}`);
  console.log(`Chat:    POST http://localhost:${port}   body: { "message": "...", "history": [], "runner": {} }`);
});
