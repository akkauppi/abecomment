import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from "@/components/ui/card";

const ViewpointFeedback = ({ viewpointId, sessionId, tags }) => {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSocketReady, setIsSocketReady] = useState(false);

  // Monitor socket availability and handle reconnection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkSocket = () => {
      const socketAvailable = window.socket !== null && window.socket.connected;
      if (socketAvailable !== isSocketReady) {
        console.log('[ViewpointFeedback] Socket status:', socketAvailable ? 'connected' : 'disconnected');
        setIsSocketReady(socketAvailable);
      }
    };

    // Check initial state
    checkSocket();

    // Setup periodic check for socket status
    const intervalId = setInterval(() => {
      checkSocket();
      if (window.socket && !window.socket.connected) {
        console.log('[ViewpointFeedback] Socket disconnected, attempting to reconnect');
        setupSocketListeners();
      }
    }, 5000);

    // Setup event listeners if socket exists
    const setupSocketListeners = () => {
      if (!window.socket) return;

      console.log('[ViewpointFeedback] Setting up socket listeners');

      // Remove any existing listeners to prevent duplicates
      window.socket.off('connect');
      window.socket.off('disconnect');
      window.socket.off('reconnect');
      window.socket.off('feedback');

      window.socket.on('connect', () => {
        console.log('[ViewpointFeedback] Socket connected');
        checkSocket();
      });

      window.socket.on('disconnect', () => {
        console.log('[ViewpointFeedback] Socket disconnected');
        checkSocket();
      });

      window.socket.on('reconnect', () => {
        console.log('[ViewpointFeedback] Socket reconnected:', {
          id: window.socket.id,
          sessionId,
          viewpointId
        });
        checkSocket();
      });

      // Setup feedback handler
      if (sessionId && viewpointId) {
        window.socket.on('feedback', (event) => {
          console.log('[ViewpointFeedback] Received feedback event');
          
          if (!event?.type || !event?.data) {
            console.error('[ViewpointFeedback] Invalid event format');
            return;
          }

          if (event.type === 'newFeedback') {
            handleNewFeedback(event.data);
          }
        });

        // Verify handler was set up
        const listeners = window.socket.listeners('feedback');
        console.log('[ViewpointFeedback] Current feedback listeners:', listeners.length);
      }
    };

    setupSocketListeners();

    // Cleanup
    return () => {
      clearInterval(intervalId);
      if (window.socket) {
        console.log('[ViewpointFeedback] Cleaning up socket listeners');
        window.socket.off('connect');
        window.socket.off('disconnect');
        window.socket.off('reconnect');
        window.socket.off('feedback');
      }
    };
  }, [sessionId, viewpointId, isSocketReady]); // Re-setup listeners when sessionId, viewpointId, or socket status changes

  // Define feedback handler function
  const handleNewFeedback = (newFeedback) => {
    if (!sessionId || !viewpointId || !newFeedback?.viewpointId || !newFeedback?.sessionId) {
      console.error('[ViewpointFeedback] Missing required feedback data');
      return;
    }

    if (newFeedback.viewpointId === viewpointId && newFeedback.sessionId === sessionId) {
      setFeedback(prevFeedback => {
        const exists = prevFeedback.some(f => f._id === newFeedback._id);
        if (exists) return prevFeedback;
        return [newFeedback, ...prevFeedback];
      });
    }
  };

  // Fetch initial feedback
  useEffect(() => {
    const fetchFeedback = async () => {
      if (!viewpointId || !sessionId) return;
      
      try {
        setLoading(true);
        const response = await fetch(`/api/feedback?viewpointId=${viewpointId}&sessionId=${sessionId}`);
        if (!response.ok) throw new Error('Failed to fetch feedback');
        const data = await response.json();
        setFeedback(data);
      } catch (error) {
        console.error('Error fetching feedback:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFeedback();
  }, [viewpointId, sessionId]);

  // Get voted tags (tags with votes > 0)
  const votedTags = tags.filter(tag => tag.votes > 0)
    .sort((a, b) => b.votes - a.votes);

  if (loading) {
    return <div className="text-center py-4">Loading feedback...</div>;
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <h3 className="text-xl font-semibold">Viewpoint Feedback</h3>
      </CardHeader>
      <CardContent className="space-y-6">
        {votedTags.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Popular Tags:</h4>
            <div className="flex flex-wrap gap-2">
              {votedTags.map(tag => (
                <span
                  key={tag._id}
                  className="px-3 py-1 bg-secondary text-secondary-foreground rounded-full text-sm"
                >
                  {tag.name} ({tag.votes})
                </span>
              ))}
            </div>
          </div>
        )}

        {feedback.length > 0 ? (
          <div className="space-y-4">
            <h4 className="font-medium">Comments:</h4>
            {feedback.map((item, index) => (
              <div key={item._id || index} className="p-4 bg-muted rounded-lg space-y-2">
                <p className="text-sm">{item.text}</p>
                {item.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag, tagIndex) => (
                      <span
                        key={tagIndex}
                        className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {new Date(item.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground">No feedback yet for this viewpoint.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default ViewpointFeedback;
