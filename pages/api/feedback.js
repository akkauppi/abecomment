// pages/api/feedback.js
import clientPromise from '../../lib/mongodb';

export default async function handler(req, res) {
  const client = await clientPromise;
  const db = client.db("urbanFeedback");

  if (req.method === 'GET') {
    try {
      const { viewpointId, sessionId } = req.query;
      
      const feedback = await db.collection('feedback')
        .find({ viewpointId, sessionId })
        .sort({ timestamp: -1 })
        .toArray();
      
      res.status(200).json(feedback);
    } catch (error) {
      console.error('Error fetching feedback:', error);
      res.status(500).json({ error: 'Failed to fetch feedback' });
    }
  } else if (req.method === 'POST') {
    try {
      const { viewpointId, sessionId, text, tags } = req.body;
      
      const feedback = {
        viewpointId,
        sessionId,
        text,
        tags,
        timestamp: new Date(),
      };
      
      const result = await db.collection('feedback').insertOne(feedback);
      
      // Get the complete feedback document with the generated _id
      const completeFeedback = {
        ...feedback,
        _id: result.insertedId
      };
      
      // Emit socket event using global io instance
      if (global.io) {
        try {
          console.log('[Server] Preparing to emit newFeedback event:', {
            sessionId,
            viewpointId,
            feedbackId: completeFeedback._id
          });

          // Get active clients in the session before emitting
          const clients = await global.io.in(sessionId).allSockets();
          const clientArray = Array.from(clients);
          console.log('[Server] Active clients in session:', {
            sessionId,
            clients: clientArray,
            count: clientArray.length
          });

          // Format feedback event data
          const feedbackEvent = {
            type: 'newFeedback',
            data: {
              ...completeFeedback,
              viewpointId,  // Ensure viewpointId is included
              sessionId     // Ensure sessionId is included
            }
          };

          console.log('[Server] Broadcasting feedback event:', feedbackEvent);

          // Broadcast only to the specific session
          await global.io.to(sessionId).emit('feedback', feedbackEvent);
          console.log('[Server] Successfully emitted newFeedback event to session:', sessionId);

          // Verify the event was sent
          clientArray.forEach(clientId => {
            const client = global.io.sockets.sockets.get(clientId);
            if (client) {
              console.log('[Server] Client status after emit:', {
                id: clientId,
                connected: client.connected,
                rooms: Array.from(client.rooms)
              });
            }
          });
        } catch (error) {
          console.error('[Server] Error emitting socket event:', error);
        }
      } else {
        console.error('[Server] Socket.IO server not available');
      }
      
      res.status(200).json({ success: true, feedbackId: result.insertedId });
    } catch (error) {
      console.error('Error in feedback API:', error);
      res.status(500).json({ error: 'Failed to save feedback' });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}
