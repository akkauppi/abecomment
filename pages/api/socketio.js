// pages/api/socketio.js
import { Server } from 'socket.io'

const ioHandler = (req, res) => {
  if (!res.socket.server.io) {
    const io = new Server(res.socket.server, {
      path: '/api/socketio',
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    })

    io.on('connection', socket => {
      console.log('Socket connected:', socket.id)

      socket.on('joinSession', ({ sessionId, viewpoint }) => {
        const room = `${sessionId}`
        socket.join(room)
        console.log(`Client ${socket.id} joined room ${room}`)
      })

      socket.on('newTag', (tag) => {
        console.log('Received new tag:', tag)
        io.emit('tagAdded', tag)
      })

      socket.on('tagVoted', (data) => {
        console.log('Vote update:', data)
        io.emit('tagVoted', data)
      })

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id)
      })
    })

    res.socket.server.io = io
  }
  res.end()
}

export default ioHandler

export const config = {
  api: {
    bodyParser: false
  }
}