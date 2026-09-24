# Lessons: concurrent splits of one boundary sit in arrival order

- **Compare trees by node ID, not by XML.** Two empty siblings in swapped
  order print the same; the divergence surfaced later, in a range delete and
  in attributes on an empty node, as two unrelated-looking bugs.
- **Route serverless packs through the converter.** This rule reads the
  operation's version vector; handing change objects across documents directly
  lets the receiver rewrite it.
- **Do not ship the client half alone.** With an unpatched server, a snapshot
  replaces the tree with the server's arrival order and re-creates the
  divergence the client just fixed.
