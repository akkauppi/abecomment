const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Initialize Socket.IO with the server
  const io = new Server(server, {
    path: '/api/socketio',
    addTrailingSlash: false,
    transports: ['polling', 'websocket'], // Allow polling fallback
    cors: {
      origin: true, // Reflects the request origin
      methods: ['GET', 'POST'],
      credentials: true
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
    allowEIO3: true, // Enable Engine.IO v3 compatibility
    pingTimeout: 60000, // Increase ping timeout
    pingInterval: 25000 // Increase ping interval
  });

  // Debug middleware
  io.use((socket, next) => {
    console.log('[Socket.IO] Socket connecting:', {
      id: socket.id,
      handshake: {
        query: socket.handshake.query,
        headers: socket.handshake.headers
      }
    });
    next();
  });

  // Track active sessions and their sockets
  const activeSessions = new Map();

  // Set up socket handlers
  io.on('connection', socket => {
    console.log('[Socket.IO] New connection:', socket.id);

    // Store sessionId in socket for later use
    let currentSessionId = null;

    // Log all current active sessions
    console.log('[Socket.IO] Current active sessions:', 
      Array.from(activeSessions.entries()).map(([sessionId, sockets]) => ({
        sessionId,
        socketCount: sockets.size
      }))
    );

    socket.on('joinSession', async ({ sessionId, viewpoint }) => {
      try {
        if (!sessionId) {
          console.log('[Socket.IO] Attempted to join with invalid sessionId');
          return;
        }

        console.log('[Socket.IO] Join session request:', {
          socketId: socket.id,
          sessionId,
          viewpoint,
          currentSessionId
        });
        
        // Leave previous session if any
        if (currentSessionId) {
          console.log('[Socket.IO] Leaving previous session:', {
            socketId: socket.id,
            previousSession: currentSessionId
          });
          await socket.leave(currentSessionId);
          
          // Remove from previous session tracking
          if (activeSessions.has(currentSessionId)) {
            activeSessions.get(currentSessionId).delete(socket.id);
            if (activeSessions.get(currentSessionId).size === 0) {
              activeSessions.delete(currentSessionId);
            }
          }
        }
        
        // Join new session
        await socket.join(sessionId);
        currentSessionId = sessionId;
        
        // Update active sessions tracking
        if (!activeSessions.has(sessionId)) {
          activeSessions.set(sessionId, new Set());
        }
        activeSessions.get(sessionId).add(socket.id);

        // Get all rooms this socket is in
        const rooms = Array.from(socket.rooms);
        const clients = await io.in(sessionId).allSockets();
        
        console.log('[Socket.IO] Session join complete:', {
          socketId: socket.id,
          sessionId,
          rooms,
          activeClients: Array.from(clients),
          clientCount: clients.size,
          activeSessions: Array.from(activeSessions.entries()).map(([id, sockets]) => ({
            sessionId: id,
            socketCount: sockets.size
          }))
        });

        // Acknowledge successful join
        socket.emit('sessionJoined', {
          sessionId,
          socketId: socket.id,
          clientCount: clients.size
        });
      } catch (error) {
        console.error('[Socket.IO] Error joining session:', error);
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    socket.on('newTag', (tag) => {
      if (!currentSessionId) return;
      console.log('New tag:', tag);
      io.to(currentSessionId).emit('tagAdded', tag);
    });

    socket.on('tagVoted', (data) => {
      if (!currentSessionId) return;
      console.log('Vote update:', data);
      io.to(currentSessionId).emit('tagVoted', data);
    });

      // Handle feedback events
      socket.on('newFeedback', async (feedback) => {
        if (!currentSessionId) {
          console.log('[Socket.IO] Received newFeedback but no currentSessionId');
          return;
        }
        
        try {
          // Ensure feedback has required fields
          if (!feedback || !feedback.viewpointId || !feedback.sessionId) {
            console.error('[Socket.IO] Invalid feedback data:', feedback);
            return;
          }

          console.log('[Socket.IO] Broadcasting newFeedback:', {
            feedback,
            currentSession: currentSessionId,
            socketId: socket.id
          });

          // Get all clients in the session
          const clients = await io.in(currentSessionId).allSockets();
          const clientArray = Array.from(clients);
          
          console.log('[Socket.IO] Active clients that will receive feedback:', {
            sessionId: currentSessionId,
            clients: clientArray,
            count: clientArray.length
          });

          // Format feedback event data
          const feedbackEvent = {
            type: 'newFeedback',
            data: {
              ...feedback,
              timestamp: new Date(),
              socketId: socket.id
            }
          };

          // Broadcast to all clients in the session
          await io.to(currentSessionId).emit('feedback', feedbackEvent);
          console.log('[Socket.IO] Successfully broadcast feedback:', feedbackEvent);

          // Verify event delivery
          clientArray.forEach(clientId => {
            const client = io.sockets.sockets.get(clientId);
            if (client) {
              console.log('[Socket.IO] Client received feedback:', {
                id: clientId,
                connected: client.connected,
                rooms: Array.from(client.rooms)
              });
            }
          });
        } catch (error) {
          console.error('[Socket.IO] Error broadcasting feedback:', error);
        }
      });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket.IO] Socket disconnected:', socket.id, 'Reason:', reason);
      
      // Clean up active sessions tracking
      if (currentSessionId && activeSessions.has(currentSessionId)) {
        activeSessions.get(currentSessionId).delete(socket.id);
        if (activeSessions.get(currentSessionId).size === 0) {
          activeSessions.delete(currentSessionId);
        }
        console.log(`[Socket.IO] Removed socket from session ${currentSessionId}`);
        console.log('[Socket.IO] Updated active sessions:', 
          Array.from(activeSessions.entries()).map(([sessionId, sockets]) => ({
            sessionId,
            socketCount: sockets.size
          }))
        );
      }
    });
  });

  // Make io instance available globally
  global.io = io;

  server.listen(3000, (err) => {
    if (err) throw err;
    console.log('> Ready on http://localhost:3000');
  });
});
