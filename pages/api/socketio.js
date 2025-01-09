import { Server } from 'socket.io'

const ioHandler = (req, res) => {
  if (res.socket.server.io) {
    console.log('Socket is already running');
    res.end();
    return;
  }

  const io = new Server(res.socket.server, {
    path: '/api/socketio',
    addTrailingSlash: false,
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    // Websocket only, no polling
    transports: ['websocket'],
    connectionStateRecovery: {
      // increase the recovery time
      maxDisconnectionDuration: 30000,
    }
  });

  // Set up socket handlers
  io.on('connection', socket => {
    console.log('Socket connected:', socket.id);

    socket.on('joinSession', ({ sessionId, viewpoint }) => {
      console.log(`Socket ${socket.id} joining session ${sessionId}`);
      socket.join(sessionId);
    });

    socket.on('newTag', (tag) => {
      console.log('New tag:', tag);
      io.emit('tagAdded', tag);
    });

    socket.on('tagVoted', (data) => {
      console.log('Vote update:', data);
      io.emit('tagVoted', data);
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', socket.id, 'Reason:', reason);
    });
  });

  res.socket.server.io = io;
  res.end();
}

export const config = {
  api: {
    bodyParser: false,
  }
}

export default ioHandler;