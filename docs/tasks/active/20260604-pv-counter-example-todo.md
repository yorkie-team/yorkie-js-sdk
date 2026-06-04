---
created: 2026-06-04
updated: 2026-06-04
tags: [example, react, counter]
---

# react-page-view-counter example

## Goal

Add a small React example under `examples/` that uses `Counter` as a
daily PV counter. Demonstrates the service pattern:
`disableGC` + `SyncMode.Manual`, with the document key rotated every 24h.

The example is intentionally minimal — not a polished UI.

## Requirements (from brainstorming)

- React SDK (`@yorkie-js/react`)
- `DocumentProvider` with `syncMode={SyncMode.Manual}` and `disableGC`
- `docKey = pv-${topicId}-${YYYYMMDD}` (local time; called out as a
  simplification in README)
- Two routes via `react-router-dom`:
  - `/` — topic list
  - `/topic/:topicId` — topic page, shows "N views today"
- On topic-page mount: `counter.increase(1)` then `client.sync(doc)`
- No refresh button, no styling effort beyond minimal CSS

## File layout

```
examples/react-page-view-counter/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ tsconfig.node.json
├─ vite.config.ts
└─ src/
   ├─ main.tsx            # YorkieProvider + BrowserRouter
   ├─ App.tsx             # Routes
   ├─ pages/
   │   ├─ Home.tsx        # topic list
   │   └─ TopicPage.tsx   # builds docKey, wraps DocumentProvider
   ├─ components/
   │   ├─ TopicView.tsx   # +1 effect + sync; reads counter
   │   └─ ViewCountBadge.tsx
   ├─ topics.ts           # 5 dummy topics
   ├─ docKey.ts           # buildPvDocKey(topicId)
   └─ styles.css
```

## Core logic

`docKey.ts`

```ts
function todayYYYYMMDD(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}${m}${day}`;
}
export const buildPvDocKey = (topicId: string) =>
  `pv-${topicId}-${todayYYYYMMDD()}`;
```

`TopicPage.tsx`

```tsx
const docKey = useMemo(() => buildPvDocKey(topicId!), [topicId]);
<DocumentProvider<{ counter?: Counter }>
  docKey={docKey}
  syncMode={SyncMode.Manual}
  disableGC
>
  <TopicView topicId={topicId!} />
</DocumentProvider>
```

`TopicView.tsx`

```tsx
const { root, update, loading, error } = useDocument<{ counter?: Counter }>();
const { client } = useYorkie();
const incrementedRef = useRef(false);

useEffect(() => {
  if (loading || !client || incrementedRef.current) return;
  incrementedRef.current = true;
  update((r) => {
    if (!r.counter) r.counter = new Counter(IntegerCnt, 0);
    r.counter.increase(1);
  });
  void client.sync(/* doc */);
}, [loading, client, update]);
```

Import `Counter` from `@yorkie-js/react`, not `@yorkie-js/sdk`
(dual-package hazard — `.increase()` fails at runtime otherwise).

## Open implementation questions

- Does `useDocument` return the `Document` instance, or do we need a
  separate hook / ref-based access to pass to `client.sync(doc)`?
  Verify when implementing; flow on the wire is the same regardless.

## RPC behavior (for README)

- `attach` (Provider mount) → 1 RPC: push (empty pack) + pull (snapshot)
- `client.sync(doc)` (effect) → 1 RPC: push (+1) + pull (concurrent +1s)
- Total: 2 RPCs.

A strictly "1 push + 1 pull" alternative requires mutating the doc
before attach — not exposed via `DocumentProvider`. Mention in a code
comment / README only.

## Non-goals

- Server-side unique-visitor / bot dedup
- Live updates while the page is open
- Visual polish
- Auth
