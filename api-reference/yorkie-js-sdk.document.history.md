<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [yorkie-js-sdk](./yorkie-js-sdk.md) &gt; [Document](./yorkie-js-sdk.document.md) &gt; [history](./yorkie-js-sdk.document.history.md)

## Document.history property

`history` is exposed to the user to manage undo/redo operations.

**Signature:**

```typescript
history: {
        canUndo: () => boolean;
        canRedo: () => boolean;
        undo: () => void;
        redo: () => void;
    };
```