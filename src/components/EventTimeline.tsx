// Replace the entire handleAddNote function
const handleAddNote = async () => {
  if (!newNote.trim()) {
    setError("Please enter a note");
    return;
  }

  const noteText = newNote.trim();
  const currentNoteType = noteType;

  const optimisticEvent: EventItem = {
    id: `temp-${Date.now()}`,
    entityType,
    entityId,
    eventType: 'NOTE',
    title: 'Note Added',
    description: noteText.length > 100 ? noteText.substring(0, 100) + '...' : noteText,
    metadata: { noteText, noteType: currentNoteType },
    createdAt: new Date().toISOString(),
    createdBy: 'current-user',
    createdByName: undefined,
  };

  setEvents(prev => [optimisticEvent, ...prev]);

  try {
    setAddingNote(true);
    setError(null);

    let endpoint: string;
    if (entityType === 'candidate') {
      endpoint = `/api/candidate/${entityId}/notes`;
    } else if (entityType === 'job') {
      endpoint = `/api/jobs/${entityId}/notes`;
    } else {
      endpoint = `/api/company/${entityId}/notes`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteText, noteType: currentNoteType }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to add note');
    }

    console.log("✅ Note saved successfully");
    alert("Note saved! Refreshing timeline..."); // Temporary

    setNewNote('');
    setNoteType('general');

    // Improved refetch with delay + retry
    await new Promise(resolve => setTimeout(resolve, 800)); // Give DynamoDB time
    await fetchEventsWithRetry(3); // up to 3 attempts
  } catch (err: any) {
    console.error('Failed to add note:', err);
    setError(err.message || 'Failed to add note');
    alert(err.message || 'Failed to add note');
    setEvents(prev => prev.filter(e => e.id !== optimisticEvent.id));
  } finally {
    setAddingNote(false);
  }
};

// New helper: fetch with retry
const fetchEventsWithRetry = async (retries: number = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await fetchEvents();
      const hasNewNote = events.some(e => e.eventType === 'NOTE' && e.id.startsWith('temp-') === false);
      if (hasNewNote || attempt === retries) return;
      await new Promise(r => setTimeout(r, 600 * attempt)); // backoff
    } catch (e) {
      if (attempt === retries) throw e;
    }
  }
};

// Your existing fetchEvents stays the same (with cache bust)
