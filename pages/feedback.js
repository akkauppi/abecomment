import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import io from 'socket.io-client';
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

let socket;

const FeedbackView = () => {
  const router = useRouter();
  const { lat, lng, dir, sessionId } = router.query;
  
  const [feedback, setFeedback] = useState('');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

  // Use environment variable for socket connection
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';
  socket = io(socketUrl, {
    transports: ['websocket'],
    reconnectionAttempts: 5
  });

    const onConnect = () => {
      console.log('Socket connected');
      setIsConnected(true);
      socket.emit('joinSession', { 
        sessionId, 
        viewpoint: { lat, lng, dir } 
      });
    };

    const onDisconnect = () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    };

    const onTagAdded = (newTag) => {
      console.log('Received new tag:', newTag);
      setTags(prevTags => {
        const exists = prevTags.some(t => t._id === newTag._id);
        if (exists) return prevTags;
        return [...prevTags, { ...newTag, selected: false }];
      });
    };

    const onTagVoted = (data) => {
      console.log('Received vote update:', data);
      setTags(prevTags => 
        prevTags.map(tag => 
          tag._id === data.tagId 
            ? { ...tag, votes: data.votes }
            : tag
        )
      );
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('tagAdded', onTagAdded);
    socket.on('tagVoted', onTagVoted);

    fetchTags();

    return () => {
      if (socket) {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('tagAdded', onTagAdded);
        socket.off('tagVoted', onTagVoted);
        socket.disconnect();
      }
    };
  }, [sessionId, lat, lng, dir]);

  const fetchTags = async () => {
    if (!sessionId || !lat || !lng || !dir) return;
    
    try {
      const response = await fetch(
        `/api/tags?sessionId=${sessionId}&lat=${lat}&lng=${lng}&dir=${dir}`
      );
      if (!response.ok) throw new Error('Failed to fetch tags');
      const data = await response.json();
      setTags(data.map(tag => ({ ...tag, selected: false })));
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const addNewTag = async () => {
    if (!newTag.trim() || !sessionId || !isConnected) return;

    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newTag.trim(),
          sessionId 
        })
      });

      if (!response.ok) throw new Error('Failed to add tag');

      const tag = await response.json();
      console.log('Emitting new tag:', tag);
      socket.emit('newTag', tag);
      setNewTag('');
    } catch (error) {
      console.error('Error adding tag:', error);
      setMessage('Error adding tag. Please try again.');
    }
  };

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewpointId: `${lat}-${lng}-${dir}`,
          sessionId,
          text: feedback,
          tags: tags.filter(tag => tag.selected).map(tag => tag.name)
        }),
      });

      if (!response.ok) throw new Error('Submission failed');
      
      setMessage('Thank you for your feedback!');
      setFeedback('');
      // Reset tag selections but keep the votes
      setTags(tags.map(tag => ({ ...tag, selected: false })));

      // Clear message after 3 seconds
      setTimeout(() => {
        setMessage('');
      }, 3000);
    } catch (error) {
      setMessage('Error submitting feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTagAndVote = async (tagId) => {
    if (!sessionId || !lat || !lng || !dir || !isConnected) return;

    // First, toggle the selection state locally
    setTags(prevTags => 
      prevTags.map(tag => 
        tag._id === tagId ? { ...tag, selected: !tag.selected } : tag
      )
    );

    try {
      const response = await fetch('/api/tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tagId,
          sessionId,
          lat,
          lng,
          dir,
          // Add action to specify if we're adding or removing vote
          action: tags.find(t => t._id === tagId)?.selected ? 'remove' : 'add'
        })
      });

      if (!response.ok) throw new Error('Failed to update vote');

      const data = await response.json();
      console.log('Vote update:', data);
      socket.emit('tagVoted', data);
    } catch (error) {
      console.error('Error updating vote:', error);
      // Revert the selection if the vote update failed
      setTags(prevTags => 
        prevTags.map(tag => 
          tag._id === tagId ? { ...tag, selected: !tag.selected } : tag
        )
      );
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6 md:p-8">
      <Card>
        <CardHeader className="space-y-2">
          <h2 className="text-2xl font-bold">Share Your Feedback</h2>
          {lat && lng && dir && (
            <p className="text-sm text-muted-foreground">
              Viewing from: {lat}, {lng} Direction: {dir}°
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmitFeedback} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Your feedback:</label>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Share your thoughts about this view..."
                className="min-h-[100px]"
                required
              />
            </div>

            <div className="space-y-4">
              <label className="text-sm font-medium">Tags:</label>
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <div key={tag._id} className="flex items-center">
                    <Button
                      type="button"
                      variant={tag.selected ? "default" : "outline"}
                      onClick={() => toggleTagAndVote(tag._id)}
                      className="h-8"
                    >
                      {tag.name} {tag.votes > 0 && `(${tag.votes})`}
                    </Button>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add new tag..."
                  className="flex-1"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addNewTag();
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={addNewTag}
                  variant="secondary"
                >
                  Add
                </Button>
              </div>
            </div>

            {message && (
              <div className={`p-3 rounded ${
                message.includes('Error') 
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-green-100 text-green-700'
              }`}>
                {message}
              </div>
            )}
          </form>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || !feedback}
            onClick={handleSubmitFeedback}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default FeedbackView;