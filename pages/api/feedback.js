// pages/api/feedback.js
import clientPromise from '../../lib/mongodb';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const client = await clientPromise;
    const db = client.db("urbanFeedback");
    
    const { viewpointId, text, tags } = req.body;
    
    const feedback = {
      viewpointId,
      text,
      tags,
      timestamp: new Date(),
    };
    
    const result = await db.collection('feedback').insertOne(feedback);
    
    res.status(200).json({ success: true, feedbackId: result.insertedId });
  } catch (error) {
    console.error('Error in feedback API:', error);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
}