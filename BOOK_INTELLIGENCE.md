# AuthorScrolls Book Intelligence v1

This branch introduces the foundation for whole-manuscript understanding without replacing the existing analyzer or editor.

## First milestone

1. Parse imported text into stable chapters while preserving exact source offsets and text.
2. Persist manuscript metadata separately from chapter text so long books are not truncated into one Firestore document.
3. Enrich chapters independently, then synthesize durable book-level entities: characters, relationships, locations, events, facts, plot threads, POV, and summaries.
4. Retrieve only relevant chapters/entities for Writer's Room and editing requests.
5. Keep all AI edits proposed until the author explicitly accepts them.

## Initial data model

```
users/{uid}/manuscripts/{manuscriptId}
  fileName
  wordCount
  chapterCount
  genre
  intelligenceVersion
  createdAt
  updatedAt

users/{uid}/manuscripts/{manuscriptId}/chapters/{chapterId}
  index
  number
  title
  start
  end
  wordCount
  text
  summary
  pov
  intelligenceVersion

users/{uid}/manuscripts/{manuscriptId}/entities/{entityId}
  type
  canonicalName
  aliases[]
  chapterIds[]
  attributes

users/{uid}/manuscripts/{manuscriptId}/facts/{factId}
  subject
  predicate
  object
  chapterId
  evidence
  confidence

users/{uid}/manuscripts/{manuscriptId}/plotThreads/{threadId}
  title
  status
  introducedIn
  chapterIds[]
  resolvedIn

users/{uid}/manuscripts/{manuscriptId}/snapshots/{snapshotId}
  reason
  createdAt
  chapterVersions
```

## Compatibility

The existing `Analyzer`, editor, Firebase auth, and AI feature code remain untouched in this first commit. `manuscript-parser.js` is additive and is not loaded by production yet. That keeps the live application unchanged while the new ingestion/storage path is built and tested.
