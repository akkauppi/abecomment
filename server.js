// server.js
const next = require('next');
const { createServer } = require('http');
const { parse } = require('url');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Track connected clients
  const connectedClients = new Set();

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    connectedClients.add(socket.id);
    console.log('Total connected clients:', connectedClients.size);

    socket.on('joinSession', ({ sessionId, viewpoint }) => {
      const room = `${sessionId}`;
      socket.join(room);
      console.log(`Client ${socket.id} joined room ${room}`);
      // Log current rooms
      console.log('Client rooms:', socket.rooms);
    });

    socket.on('newTag', (tag) => {
      console.log('Received new tag event:', tag);
      // Broadcast to ALL clients in the session
      io.emit('tagAdded', tag);
      console.log('Broadcasted tagAdded event to all clients');
    });

    socket.on('tagVoted', (data) => {
      console.log('Received vote event:', data);
      // Broadcast to ALL clients
      io.emit('tagVoted', data);
      console.log('Broadcasted tagVoted event to all clients');
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      connectedClients.delete(socket.id);
      console.log('Remaining connected clients:', connectedClients.size);
    });
  });

  server.listen(3000, (err) => {
    if (err) throw err;
    console.log('> Ready on http://localhost:3000');
  });
});