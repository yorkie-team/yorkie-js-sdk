# Lessons: devtools activeTab permission

**Created**: 2026-11-18

- The Chrome Web Store's automated review checks each requested
  permission against the APIs the bundle calls. A permission left over from
  scaffolding (`activeTab` here, carried since the monorepo move) can pass
  for years and then block a release.
- Before adding a permission to `manifest` in `package.json`, name the API
  call that needs it. Most `chrome.tabs` calls (`connect`, `reload`,
  `onUpdated` without reading `url`) need none.
- Locally, `verify:fast` on Node 24 fails 23 offline persistence unit tests
  unrelated to this change; CI runs Node 22.
