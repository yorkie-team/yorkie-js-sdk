<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [yorkie-js-sdk](./yorkie-js-sdk.md) &gt; [Change](./yorkie-js-sdk.change.md) &gt; [execute](./yorkie-js-sdk.change.execute.md)

## Change.execute() method

`execute` executes the operations of this change to the given root.

**Signature:**

```typescript
execute(root: CRDTRoot, presences: Map<ActorID, P>, source: OpSource): {
        opInfos: Array<OperationInfo>;
        reverseOps: Array<HistoryOperation<P>>;
    };
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  root | CRDTRoot |  |
|  presences | Map&lt;[ActorID](./yorkie-js-sdk.actorid.md)<!-- -->, P&gt; |  |
|  source | OpSource |  |

**Returns:**

{ opInfos: Array&lt;[OperationInfo](./yorkie-js-sdk.operationinfo.md)<!-- -->&gt;; reverseOps: Array&lt;HistoryOperation&lt;P&gt;&gt;; }
