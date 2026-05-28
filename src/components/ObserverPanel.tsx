/**
 * ObserverPanel Component - Display system observer events
 * Features: Event log, event type filtering, clear events
 * Real-time updates via polling
 */

import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { useObserverAPI } from '../hooks/useObserverAPI';

interface ObserverPanelProps {
  compact?: boolean;
  maxEvents?: number;
}

export default function ObserverPanel({ compact = false, maxEvents = 20 }: ObserverPanelProps) {
  const { state, events, error, fetchEvents, clearEvents } = useObserverAPI();

  useEffect(() => {
    fetchEvents(maxEvents);
  }, [maxEvents, fetchEvents]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'calendarEvent': return '📅';
      case 'unreadEmail': return '📧';
      case 'activeWindow': return '🪟';
      case 'systemLoad': return '⚙️';
      case 'heartbeat': return '💓';
      default: return '•';
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'calendarEvent': return 'text-blue-400';
      case 'unreadEmail': return 'text-green-400';
      case 'activeWindow': return 'text-purple-400';
      case 'systemLoad': return 'text-yellow-400';
      case 'heartbeat': return 'text-gray-500';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">System Observer</h3>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${state?.isRunning ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-500">{state?.eventCount || 0} events</span>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-950 px-2 py-1 rounded">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-2">
        {state && !state.isRunning && (
          <button className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded">
            Start Observer
          </button>
        )}
        {state?.isRunning && (
          <button className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded">
            Stop Observer
          </button>
        )}
        {events.length > 0 && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={clearEvents}
            className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Clear
          </motion.button>
        )}
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto bg-gray-950 rounded-lg p-2">
        {events.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-3">No events</p>
        ) : (
          events.map((event, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xs py-1 px-2 bg-gray-900 rounded border border-gray-800 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className={`text-sm ${getEventColor(event.type)} flex-shrink-0`}>
                  {getEventIcon(event.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-200 truncate">
                    <span className="text-gray-400 capitalize">
                      {event.type.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  </p>
                  {!compact && Object.entries(event.data).length > 0 && (
                    <p className="text-gray-500 text-xs truncate">
                      {JSON.stringify(event.data).substring(0, 50)}...
                    </p>
                  )}
                  <p className="text-gray-600 text-xs">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {state && (
        <div className="text-xs text-gray-500 bg-gray-900 rounded p-2 border border-gray-800">
          <p>Poll interval: {state.pollIntervalMs}ms</p>
          <p>Last tick: {state.lastTick ? new Date(state.lastTick).toLocaleTimeString() : '—'}</p>
        </div>
      )}
    </div>
  );
}
