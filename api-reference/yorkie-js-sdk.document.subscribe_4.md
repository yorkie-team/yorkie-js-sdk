<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [yorkie-js-sdk](./yorkie-js-sdk.md) &gt; [Document](./yorkie-js-sdk.document.md) &gt; [subscribe](./yorkie-js-sdk.document.subscribe_4.md)

## Document.subscribe() method

`subscribe` registers a callback to subscribe to events on the document. The callback will be called when the stream connection status changes.

**Signature:**

```typescript
subscribe(type: 'connection', next: NextFn<DocEvent<P>>, error?: ErrorFn, complete?: CompleteFn): Unsubscribe;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  type | 'connection' |  |
|  next | [NextFn](./yorkie-js-sdk.nextfn.md)<!-- -->&lt;[DocEvent](./yorkie-js-sdk.docevent.md)<!-- -->&lt;P&gt;&gt; |  |
|  error | [ErrorFn](./yorkie-js-sdk.errorfn.md) | _(Optional)_ |
|  complete | [CompleteFn](./yorkie-js-sdk.completefn.md) | _(Optional)_ |

**Returns:**

[Unsubscribe](./yorkie-js-sdk.unsubscribe.md)
