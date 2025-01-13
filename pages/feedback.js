import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import io from 'socket.io-client';
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import ViewpointFeedback from '@/components/feedback/ViewpointFeedback';

// Make socket globally available
if (typeof window !== 'undefined') {
  window.socket = window.socket || null;
}

const FeedbackView = () => {
  const router = useRouter();
  const { lat, lng, dir, sessionId } = router.query;
  
  const [feedback, setFeedback] = useState('');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  // Socket initialization
  useEffect(() => {
    if (!sessionId || !lat || !lng || !dir) {
      console.log('[Feedback] Missing required params for socket setup:', { sessionId, lat, lng, dir });
      return;
    }

    let socketInstance = null;

    const setupSocket = () => {
      try {
        // Create new socket instance
        socketInstance = io({
          path: '/api/socketio',
          transports: ['websocket'],
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000,
          forceNew: true
        });

        // Set up event handlers
        socketInstance.on('connect', () => {
          console.log('[Feedback] Socket connected');
          setIsConnected(true);
          
          // Join session after successful connection
          socketInstance.emit('joinSession', { 
            sessionId, 
            viewpoint: { lat, lng, dir } 
          });
          
          window.socket = socketInstance;
        });

        // Handle all disconnect scenarios
        const handleDisconnect = (reason) => {
          console.log('[Feedback] Socket disconnected:', reason);
          setIsConnected(false);
          window.socket = null;
        };

        socketInstance.on('disconnect', handleDisconnect);
        socketInstance.on('connect_error', () => handleDisconnect('connect_error'));
        socketInstance.on('connect_timeout', () => handleDisconnect('timeout'));
        socketInstance.on('reconnect_failed', () => handleDisconnect('reconnect_failed'));

        socketInstance.on('reconnect', () => {
          console.log('[Feedback] Socket reconnected');
          setIsConnected(true);
        });

        // Handle tag events
        socketInstance.on('tagAdded', (newTag) => {
          setTags(prevTags => {
            const exists = prevTags.some(t => t._id === newTag._id);
            if (exists) return prevTags;
            return [...prevTags, { ...newTag, selected: false }];
          });
        });

        socketInstance.on('tagVoted', (data) => {
          setTags(prevTags => 
            prevTags.map(tag => 
              tag._id === data.tagId 
                ? { ...tag, votes: data.votes }
                : tag
            )
          );
        });
      } catch (error) {
        console.error('Socket initialization error:', error);
        setIsConnected(false);
      }
    };

    setupSocket();
    fetchTags();

    // Cleanup
    return () => {
      if (socketInstance) {
        console.log('Cleaning up socket connection');
        socketInstance.off('connect');
        socketInstance.off('disconnect');
        socketInstance.off('tagAdded');
        socketInstance.off('tagVoted');
        socketInstance.disconnect();
        window.socket = null;
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
    if (!newTag.trim() || !sessionId || !isConnected || !window.socket) return;

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
      window.socket.emit('newTag', tag);
      setNewTag('');
    } catch (error) {
      console.error('Error adding tag:', error);
      setMessage('Error adding tag. Please try again.');
    }
  };

  const toggleTagAndVote = async (tagId) => {
    if (!sessionId || !lat || !lng || !dir || !isConnected || !window.socket) return;

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
          action: tags.find(t => t._id === tagId)?.selected ? 'remove' : 'add'
        })
      });

      if (!response.ok) throw new Error('Failed to update vote');

      const data = await response.json();
      window.socket.emit('tagVoted', data);
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

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    if (!window.socket) return;
    
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
      
      const result = await response.json();
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

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 md:p-8 space-y-6">
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

      {/* Add ViewpointFeedback component */}
      {lat && lng && dir && sessionId && (
        <ViewpointFeedback 
          viewpointId={`${lat}-${lng}-${dir}`}
          sessionId={sessionId}
          tags={tags}
        />
      )}
    </div>
  );
};

export default FeedbackView;
