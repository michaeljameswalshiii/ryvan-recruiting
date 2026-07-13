{/* Timeline */}
<div className="p-4" style={{ maxHeight, overflowY: 'auto' }}>
  {loading && events.length === 0 && (
    <div className="text-center text-sm text-gray-500 py-4">Loading events...</div>
  )}

  {error && <div className="text-red-600 text-sm mb-4 p-3 bg-red-50 rounded">{error}</div>}

  {events.length === 0 && !loading ? (
    <div className="text-center text-sm text-gray-500 py-8">No events yet.</div>
  ) : (
    <div className="space-y-4 relative">
      <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />

      {events.map((event, index) => {
        // Defensive check
        if (!event || !event.id) {
          console.warn('Invalid event:', event);
          return null;
        }

        return (
          <div key={event.id || `event-${index}`} className="flex gap-3 relative">
            <div className={`relative w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${getEventColor(event.eventType || 'default')}`}>
              {getEventIcon(event.eventType || 'default')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${getEventColor(event.eventType || 'default')}`}>
                  {getEventLabel(event.eventType || 'default')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(event.createdAt || new Date().toISOString())}
                </span>
              </div>
              <div className="font-medium text-sm">{event.title || 'Event'}</div>
              {event.description && typeof event.description === 'string' && (
                <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
              )}
              <div className="text-xs text-muted-foreground mt-2">
                by {event.createdByName || event.createdBy || 'Unknown'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>
