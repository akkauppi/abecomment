// pages/api/tags.js
import clientPromise from '../../lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const client = await clientPromise;
  const db = client.db("urbanFeedback");
  const tagsCollection = db.collection('tags');
  const votesCollection = db.collection('viewpointVotes');

  if (req.method === 'GET') {
    const { sessionId, lat, lng, dir } = req.query;
    const viewpointId = `${lat}-${lng}-${dir}`;

    try {
      // Get all tags for the session
      const tags = await tagsCollection.find({ sessionId }).toArray();
      
      // Get votes for this specific viewpoint
      const votes = await votesCollection.find({ 
        sessionId,
        viewpointId
      }).toArray();

      // Combine tags with their viewpoint-specific votes
      const tagsWithVotes = tags.map(tag => ({
        ...tag,
        votes: votes.find(v => v.tagId.toString() === tag._id.toString())?.count || 0
      }));

      res.status(200).json(tagsWithVotes);
    } catch (error) {
      console.error('Error in GET:', error);
      res.status(500).json({ error: 'Failed to fetch tags' });
    }
  } 
  else if (req.method === 'POST') {
    const { name, sessionId } = req.body;
    
    try {
      const existingTag = await tagsCollection.findOne({ 
        name, 
        sessionId 
      });

      if (existingTag) {
        return res.status(400).json({ error: 'Tag already exists' });
      }

      const newTag = {
        name,
        sessionId,
        createdAt: new Date(),
      };

      const result = await tagsCollection.insertOne(newTag);
      const insertedTag = { 
        ...newTag, 
        _id: result.insertedId, 
        votes: 0 
      };
      
      res.status(201).json(insertedTag);
    } catch (error) {
      console.error('Error in POST:', error);
      res.status(500).json({ error: 'Failed to create tag' });
    }
  }
  else if (req.method === 'PUT') {
    const { tagId, sessionId, lat, lng, dir, action } = req.body;
    const viewpointId = `${lat}-${lng}-${dir}`;

    try {
      // Find current vote count
      const currentVote = await votesCollection.findOne({
        tagId: new ObjectId(tagId),
        sessionId,
        viewpointId
      });

      // If removing vote and no current vote document exists, or count is 0, do nothing
      if (action === 'remove' && (!currentVote || currentVote.count <= 0)) {
        return res.status(200).json({ 
          tagId,
          sessionId,
          viewpointId,
          votes: 0
        });
      }

      // Update vote count
      const updateResult = await votesCollection.updateOne(
        { 
          tagId: new ObjectId(tagId),
          sessionId,
          viewpointId
        },
        { 
          $inc: { count: action === 'remove' ? -1 : 1 },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );

      // Get updated vote count
      const updatedVote = await votesCollection.findOne({
        tagId: new ObjectId(tagId),
        sessionId,
        viewpointId
      });

      res.status(200).json({ 
        tagId,
        sessionId,
        viewpointId,
        votes: Math.max(0, updatedVote?.count || 0) // Ensure votes don't go below 0
      });
    } catch (error) {
      console.error('Error in PUT:', error);
      res.status(500).json({ error: 'Failed to update votes' });
    }
  }
}