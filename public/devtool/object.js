const objectDevtool = (
  doc,
  { rootHolder, opsHolder, undoOpsHolder, redoOpsHolder },
) => {
  const displayRootObject = () => {
    const rootObj = doc.getRoot().toJSForTest();
    rootHolder.innerHTML = `
        <div class="devtool-root-holder">
            ${renderContainer(rootObj)}
        </div>
        `;
  };

  const renderContainer = ({ key, value, id }) => {
    const valueHTML = Object.values(value)
      .map((v) => {
        return v.type === 'YORKIE_OBJECT' || v.type === 'YORKIE_ARRAY'
          ? renderContainer(v)
          : renderValue(v);
      })
      .join('');
    if (key === undefined) key = 'root';
    return `
        <div class="object-key-val">
            ${renderKey({ key, id })}
            <div class="object-content">
                ${valueHTML}
            </div>
        </div>
        `;
  };

  const renderKey = ({ key, id }) => {
    return `
        <input type="checkbox" id="${id}" />
        <label for="${id}">${key}
            <span class="timeticket">${id}</span>
        </label>
        `;
  };

  const renderValue = ({ key, value, id }) => {
    return `
        <div class="object-val">
            <span>${key} : ${JSON.stringify(value)}
                <span class="timeticket">${id}</span>
            </span>
        </div>
        `;
  };

  const displayOps = () => {
    opsHolder.innerHTML = `
        <div class="devtool-ops-holder">
            ${renderOpsHolder(doc.getOpsForTest(), 'op')}
        </div>
        `;
  };

  const displayUndoOps = () => {
    undoOpsHolder.innerHTML = `
        <div class="devtool-ops-holder">
            ${renderOpsHolder(doc.getUndoStackForTest(), 'undo')}
        </div>
        `;
  };

  const displayRedoOps = () => {
    redoOpsHolder.innerHTML = `
        <div class="devtool-ops-holder">
            ${renderOpsHolder(doc.getRedoStackForTest(), 'redo')}
        </div>
        `;
  };

  const renderOpsHolder = (changes, idPrefix) => {
    return changes
      .map((ops, i) => {
        const opsStr = ops
          .map((op) => {
            if (op.type === 'presence') {
              return `<span class="op"><span class="type presence">presence</span>${JSON.stringify(
                op.value,
              )}</span>`;
            }
            const opType = op.toTestString().split('.')[1];
            try {
              const id = op.getExecutedAt()?.toTestString();
              return `
                <span class="op">
                  <span class="type ${opType.toLowerCase()}">${opType}</span>
                  ${`<span class="timeticket">${id}</span>`}${op.toTestString()}
                </span>`;
            } catch (e) {
              // operation in the undo/redo stack does not yet have "executedAt" set.
              return `
                <span class="op">
                  <span class="type ${opType.toLowerCase()}">${opType}</span>
                  ${op.toTestString()}
                </span>`;
            }
          })
          .join('\n');
        return `
            <div class="change">
                <input type="checkbox" id="${idPrefix}-${i}" />
                <label for="${idPrefix}-${i}">
                <span class="count">${ops.length}</span>
                <span class="ops">${opsStr}</span>
                </label>
            </div>
            `;
      })
      .reverse()
      .join('');
  };

  return { displayRootObject, displayOps, displayUndoOps, displayRedoOps };
};

export default objectDevtool;
