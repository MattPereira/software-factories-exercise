# Modules

Each folder here is a **deep module**: a lot of behaviour behind a small interface. Its public surface is its **entry points**, the files at the module root. Everything in a subfolder is private.

```
app/modules/
  <name>/
    index.server.ts  ← entry point. Import this from outside.
    client.ts        ← another entry point, if needed. Several small ones beat one big one.
    lib/             ← implementation. Hidden from outside; files import each other freely.
    tests/           ← tests + fixtures. Test through the entry points.
```

To start a module, copy `example/` (a minimal template). `instructor-analytics/` is a real one.

**No barrel files.** Don't re-export a whole subtree through one `index.ts`. Export only what callers need, and add another small root file when a different caller needs a different slice.

## Rules

Enforced by dependency-cruiser (`.dependency-cruiser.cjs`). Run `npm run lint:boundaries`.

1. **Entry-point boundary.** Code outside a module (routes, components, `app/lib`, other modules) imports only its root files, never anything in its subfolders.
2. **Intra-module freedom.** A module's own files import each other freely.
3. **Tests through the entry points.** Files in `<name>/tests/` may import any module's entry points and their own `tests/` fixtures, never any module's subfolder internals, not even their own. Nothing outside `tests/` may import fixtures.
4. **No cycles.** No dependency cycles anywhere in `app/`.

Modules are flat: one tier under `app/modules/`. Internals may nest as deep as you like, but a module may not contain another module.
