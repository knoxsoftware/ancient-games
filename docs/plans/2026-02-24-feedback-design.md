# Feedback Feature Design

**Date:** 2026-02-24

## Overview

Add a simple in-app feedback mechanism. Users can submit free-text feedback from both the game room and the tournament lobby. Feedback is persisted to MongoDB and retrievable via REST endpoints.

## Backend

### Model — `backend/src/models/Feedback.ts`

```ts
{
  text: string           // required — the user's feedback
  gameType?: string      // optional — e.g. "ur", "senet"
  sessionCode?: string   // optional — the session the user was in
  playerName?: string    // optional — display name of the submitter
  createdAt: Date        // auto-set on creation
}
```

### Routes — `backend/src/routes/feedback.ts`

Mounted at `/api/feedback`:

| Method | Path              | Description                          |
|--------|-------------------|--------------------------------------|
| POST   | `/api/feedback`   | Create a feedback entry (201)        |
| GET    | `/api/feedback`   | Return all entries, newest first     |
| DELETE | `/api/feedback/clear` | Delete all entries               |
| DELETE | `/api/feedback/:id`   | Delete a single entry by Mongo ID |

Note: `/clear` must be registered before `/:id` to avoid routing conflicts.

### `server.ts`

Import and mount the feedback router alongside the existing session and push routes.

## Frontend

### `FeedbackModal.tsx` — `frontend/src/components/FeedbackModal.tsx`

Props:
```ts
{
  gameType?: string
  sessionCode?: string
  playerName?: string
  onClose: () => void
}
```

Behaviour:
- Renders a modal overlay matching the existing rules modal style (dark bg, gold border)
- Contains a `<textarea>` labelled "Share your feedback"
- Submit button calls `POST /api/feedback` with text + metadata
- On success: closes modal
- On error: shows inline error message

### Button placement

A small icon button styled to match the existing `?` help button (gold border, same dimensions). Label: a speech bubble character or the text "Feedback".

**`GameRoom.tsx`:** Add button in the header, next to the `?` button. Add `showFeedback` state; pass `session.gameType`, `sessionCode`, and the current player's `displayName` to `FeedbackModal`.

**`SessionLobby.tsx`:** Add button next to each of the two existing Leave buttons. Pass `session.gameType`, `sessionCode`, and the current player's `displayName`.

## Approach

Option A — shared `FeedbackModal` component with prop threading. Both pages import the component and pass what they know. No global state or context needed.
