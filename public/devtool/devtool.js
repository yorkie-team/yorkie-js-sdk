/* eslint-env browser */
/* eslint-disable jsdoc/require-jsdoc*/

const textLogHolder = document.getElementById('text-log-holder');
const structureLogHolder = document.getElementById('structure-log-holder');
const structureTextHolder = document.getElementById('structure-text-holder');
const treeArea = document.querySelector('.tree-area');
const splaytreeLogHolder = document.getElementById('splaytree-log-holder');
const splayTreeInfo = document.getElementById('splaytree-info');
const llrbtreeLogHolder = document.getElementById('llrbtree-log-holder');
const llrbTreeInfo = document.getElementById('llrbtree-info');

let firstRendering = true;
function displayLog(doc) {
  window.blockList = [];

  displayBlockLog(doc);
  // Displays a tree log with a timer to improve rendering performance.
  // If there is an existing timer, it cancels it to prevent redundant rendering calls.
  displayTreeLogWithTimer(doc);
}

// ======================================
// ========== Block Rendering ===========
// ======================================

function displayBlockLog(doc) {
  window.blockList = [];
  window.blockKeys = {};

  // 01. display structure text
  const contentString = doc.getRoot().content.toTestString();
  structureTextHolder.innerHTML = contentString;

  // Make textItems to blockList
  const textItems = [...contentString.matchAll(/(\[[^\]]*\]|\{[^\}]*})/g)];
  let textOffset = 0;
  for (const item of textItems) {
    let block = null;
    if (item[0].startsWith('[')) {
      block = getEditBlock(item[0].match(/\[([^\]]*)\]/));
      block.offset = textOffset;
      textOffset += block.value.length;
      window.blockKeys[block.time] = block;
    } else {
      // deleted block
      block = getDeleteBlock(item[0].match(/\{([^\}]*)\}/));
    }
    window.blockList.push(block);
  }

  // 02. display structure data
  structureLogHolder.innerHTML = window.blockList
    .map((block) => {
      const value = `${block.time} ${displayValue(block.value)}`;
      const style = `--client-color: ${block.color};`;
      const attribute = `data-time="${block.time}" style="${style}"`;

      if (block.deleted) {
        return `
          <div  class="structure-item deleted" ${attribute}>
            <span class="icon">&times;</span>{${value}}
          </div>`;
      } else {
        return `
          <div class="structure-item edit" ${attribute}>
            <span class="icon"></span>[${value}]
          </div>`;
      }
    })
    .join('');

  // 03. display char item
  textLogHolder.innerHTML = window.blockList
    .map((block) => {
      const defaultClass = `char-item ${block.deleted ? 'deleted' : 'real'}`;
      const defaultAttributes = [
        `data-time="${block.time}"`,
        `title="${block.key}"`,
        `data-has-length="${block.value.length > 1}"`,
      ].join(' ');

      if (block.deleted) {
        return `<span class="${defaultClass}" ${defaultAttributes} style="background-color: ${
          block.color
        }">
          <div class="time">${block.time}</div>
          <div>${displayValue(block.value)}</div>
        </span>`;
      } else {
        return `<span class="${defaultClass}" ${defaultAttributes} style="border: 1px solid ${
          block.color
        }" data-offset="${block.offset}">
          <div class="time">${block.time}</div>
          <div>${displayValue(block.value)}</div>
        </span>`;
      }
    })
    .join('');
}

function getEditBlock(block) {
  const [, key] = block;
  const [time, ...valueList] = key.split(' ');
  const value = valueList.join(' ');
  const [lamport, ticker, delimiter, offset] = time.split(':');
  const color = Object.values(window.usersInfo).find(
    (it) => it.ticker === ticker,
  )?.color;

  return {
    key,
    value,
    color,
    time,
    lamport,
    ticker,
    t: delimiter,
    offset,
    blockKey: `${lamport}:${ticker}:${delimiter}`,
  };
}

function getDeleteBlock(block) {
  const [, key] = block;
  const [time, value] = key.split(' ');
  const [lamport, ticker, delimiter, offset] = time.split(':');
  const color = Object.values(window.usersInfo).find(
    (it) => it.ticker === ticker,
  )?.color;

  return {
    deleted: true,
    key,
    value,
    color,
    time,
    lamport,
    ticker,
    t: delimiter,
    offset,
    blockKey: `${lamport}:${ticker}:${delimiter}`,
  };
}

function displayValue(value) {
  if (value === ' ') {
    return '&lt;space&gt;';
  } else if (value === '\n') {
    return '&lt;enter&gt;';
  } else if (value === '\t') {
    return '&lt;tab&gt;';
  }

  return value;
}

// ======================================
// ========== Tree Rendering ============
// ======================================

function displayTreeLogWithTimer(doc) {
  if (window.timer) {
    clearTimeout(window.timer);
  }

  window.timer = setTimeout(() => {
    displayTreeLog(doc);
    displayBlockLog(doc);
  }, 500);
}

let splayNext = [];
let llrbNext = [];
function displayTreeLog(doc) {
  // render splay tree
  splayNext = [];
  const splayhead = getNewSplayTree(
    doc.getRoot().content.text.rgaTreeSplit.treeByIndex.root,
  );
  window.splayHeadNode = splayhead;
  calculateTreeViewport(splayhead);
  calculateAbsolutePosition('splay', splayhead, 0, splayhead.viewport.width);
  splayTreeInfo.innerHTML = `depth: ${splayNext.length - 1}`;
  splaytreeLogHolder.innerHTML =
    renderHeadLineView('splay', splayhead) + renderHeadHTML('splay', splayhead);

  // render llrb tree
  llrbNext = [];
  const llrbhead = getNewLLRBTree(
    doc.getRoot().content.text.rgaTreeSplit.treeByID.root,
  );
  window.llrbHeadNode = llrbhead;
  calculateTreeViewport(llrbhead);
  calculateAbsolutePosition('llrb', llrbhead, 0, llrbhead.viewport.width);
  llrbTreeInfo.innerHTML = `depth: ${llrbNext.length - 1}`;
  llrbtreeLogHolder.innerHTML =
    renderHeadLineView('llrb', llrbhead) + renderHeadHTML('llrb', llrbhead);

  if (firstRendering) {
    const rootRect = treeArea.getBoundingClientRect();
    moveToSelectedItem(window.splayPanzoomInstance, rootRect, splayhead);
    moveToSelectedItem(window.llrbPanzoomInstance, rootRect, llrbhead);
    firstRendering = false;
  }
}

function getNewSplayTree(node, depth = 0, parent = null) {
  if (typeof splayNext[depth] !== 'number') {
    splayNext[depth] = 0;
  }

  const currentNode = {
    parent,
    depth,
    next: splayNext[depth]++,
    actorID: node.id.createdAt.actorID,
    isRemoved: node?.isRemoved?.(),
    removedAt: node?.removedAt,
    key: node.id.toTestString(),
    weight: node.weight,
    value: node.value?.content,
    attributes: node.value?.attributes,
  };
  currentNode.left = node.left
    ? getNewSplayTree(node.left, depth + 1, currentNode)
    : null;
  currentNode.right = node.right
    ? getNewSplayTree(node.right, depth + 1, currentNode)
    : null;
  return currentNode;
}

function getNewLLRBTree(node, depth = 0, parent = null) {
  if (typeof llrbNext[depth] !== 'number') {
    llrbNext[depth] = 0;
  }

  const currentNode = {
    parent,
    depth,
    next: llrbNext[depth]++,
    actorID: node.key.createdAt.actorID,
    isRemoved: node.value.isRemoved(),
    removedAt: node.value.removedAt,
    key: node.key.toTestString(),
    weight: node.value.weight,
    value: node.value.value?.content,
    isRed: node.isRed,
  };
  currentNode.left = node.left
    ? getNewLLRBTree(node.left, depth + 1, currentNode)
    : null;
  currentNode.right = node.right
    ? getNewLLRBTree(node.right, depth + 1, currentNode)
    : null;
  return currentNode;
}

function calculateTreeViewport(node) {
  if (!node) {
    return;
  }
  if (!node.left && !node.right) {
    node.viewport = {
      width: 64,
    };
    return;
  }

  node.viewport = {
    width: 0,
  };
  if (node.left) {
    calculateTreeViewport(node.left);
    node.viewport.width += node.left.viewport.width;
    node.viewport.width += 10;
  }
  if (node.right) {
    calculateTreeViewport(node.right);
    node.viewport.width += node.right.viewport.width;
  }
}

function calculateAbsolutePosition(type, node, startX = 0, endX = 0) {
  if (!node) {
    return;
  }

  node.viewport.x = startX + node.viewport.width / 2;
  node.viewport.top = node.depth * 52;
  node.viewport.left = node.viewport.x;

  let hasReconcileLeft = false;

  if (node.left) {
    if (
      (node.right?.left || node.right?.right) &&
      !node.left.left &&
      !node.left.right
    ) {
      if (node.right) {
        hasReconcileLeft = true;
      }
    } else {
      // startX -= (node.right?.viewport.width || 0);
    }
    calculateAbsolutePosition(
      type,
      node.left,
      startX,
      startX + node.left.viewport.width,
    );
  }

  let hasReconcileRight = false;
  if (node.right) {
    if (
      (node.left?.left || node.left?.right) &&
      !node.right.left &&
      !node.right.right
    ) {
      if (node.left) {
        hasReconcileRight = true;
      }
    } else {
      startX += node.left?.viewport.width || 0;
    }
    calculateAbsolutePosition(
      type,
      node.right,
      startX + 10,
      startX + node.right.viewport.width,
    );
  }

  if (hasReconcileLeft) {
    node.left.viewport.left =
      node.viewport.left - node.left.viewport.width / 2 - 10;
  }
  if (hasReconcileRight) {
    if (node.left) {
      node.right.viewport.left = node.left.viewport.left + 70;
    } else {
      node.right.viewport.left =
        node.viewport.left + node.viewport.width / 2 + 10;
    }
  }
}

function renderHeadLineView(type, node) {
  return `
  <div class="line-holder">
    <svg overflow="visible">
      <path class="line" d="${renderLineHTML(type, node)}"/>
    </svg>
  </div>`;
}

function renderLineHTML(type, node) {
  if (!node) {
    return '';
  }
  return `
    ${
      node.parent
        ? `M ${node.viewport.left + 40} ${node.viewport.top + 25} L ${
            node.parent.viewport.left + 40
          } ${node.parent.viewport.top + 25}`
        : ''
    }
    ${node.left ? renderLineHTML(type, node.left) : ''}
    ${node.right ? renderLineHTML(type, node.right) : ''}
  `;
}

function renderHeadHTML(type, node) {
  if (!node) {
    return '';
  }

  // prettier-ignore
  return (
    `<div 
        class="node-item ${node.isRemoved ? 'is-removed' : ''}" 
        style="--ticker-color: ${window.usersInfo[node.actorID]?.color}; transform-origin: center center; transform: translate3d(${node.viewport.left}px, ${node.viewport.top}px, 0px);"
        data-key="${node.key}">
      <div class="content">
        <div class="inner-description">
          ${!node.isRemoved ? `<div class="prev-view">&lt;</div>` : ''}
          <div class="key-area">${node.key}</div>
          <div class="value-area">
            <div class="weight">${node.weight === 0 ? 'Ø' : node.weight}</div>
            <div class="value">${displayValue(node.value)}</div>
          </div>
          ${!node.isRemoved ? `<div class="next-view">&gt;</div>` : ''}
        </div>
      </div>
    </div>`
    + (node.left ? renderHeadHTML(type, node.left) : '')
    + (node.right ? renderHeadHTML(type, node.right) : '')
  );
}

// Initialize panzoom
window.splayPanzoomInstance = panzoom(splaytreeLogHolder, {
  transformOrigin: {
    x: 0.5,
    y: 0.5,
  },
});
window.llrbPanzoomInstance = panzoom(llrbtreeLogHolder, {
  transformOrigin: {
    x: 0.5,
    y: 0.5,
  },
});

// ======================================
// ========== Selecting Node ============
// ======================================

window.selectedNodeElement = null;
window.llrbselectedNodeElement = null;
window.selectedNodeCharElement = null;
window.selectedNodeStructureElement = null;

document.addEventListener('click', function (e) {
  // Move to the prev node of the selected node
  const prevView = e.target.closest('.prev-view');
  if (prevView) {
    goPrevNode(e);
    return;
  }

  // Move to the next node of the selected node
  const nextView = e.target.closest('.next-view');
  if (nextView) {
    goNextNode(e);
    return;
  }

  // TreeLog - select tree node
  const nodeItem = e.target.closest('.node-item');
  if (nodeItem) {
    const itemID = nodeItem.getAttribute('data-key');
    const innerDescription = e.target.closest('.inner-description');
    if (innerDescription) {
      highlightAndMoveToSelectedItem(itemID);
    }
  }

  // BlockLog - select text
  const charItem = e.target.closest('.char-item');
  if (charItem) {
    const itemID = charItem.getAttribute('data-time');
    highlightAndMoveToSelectedItem(itemID);
  }

  // BlockLog - select structure data
  const structureItem = e.target.closest('.structure-item');
  if (structureItem) {
    const itemID = structureItem.getAttribute('data-time');
    highlightAndMoveToSelectedItem(itemID);
  }
});

function goPrevNode(e) {
  e.preventDefault();
  const nodeItem = e.target.closest('.node-item');
  if (!nodeItem) return;
  const nodeID = nodeItem.getAttribute('data-key');
  const innerDescription = e.target.closest('.inner-description');
  if (!innerDescription) return;

  // find current tree node
  const currentTreeNode = traverseTree(window.splayHeadNode, (node) => {
    if (node.key === nodeID) {
      return true;
    }
  });
  if (currentTreeNode.deleted) return;

  // find previous node that has not been deleted
  const currentIndex = window.blockList.findIndex((block) => {
    if (block.time === currentTreeNode.key) {
      return true;
    }
  });
  if (currentIndex > -1) {
    for (let startIndex = currentIndex - 1; startIndex >= 0; startIndex--) {
      const prevItem = window.blockList[startIndex];
      if (!prevItem.deleted) {
        highlightAndMoveToSelectedItem(prevItem.time);
        return;
      }
    }
  }
}

function goNextNode(e) {
  e.preventDefault();
  const nodeItem = e.target.closest('.node-item');
  if (!nodeItem) return;
  const nodeID = nodeItem.getAttribute('data-key');
  const innerDescription = e.target.closest('.inner-description');
  if (!innerDescription) return;

  // find current tree node
  const currentTreeNode = traverseTree(window.splayHeadNode, (node) => {
    if (node.key === nodeID) {
      return true;
    }
  });
  if (currentTreeNode.deleted) return;

  // find next node that has not been deleted
  const currentIndex = window.blockList.findIndex((block) => {
    if (block.time === currentTreeNode.key) {
      return true;
    }
  });
  if (currentIndex > -1) {
    for (
      let startIndex = currentIndex + 1;
      startIndex < window.blockList.length;
      startIndex++
    ) {
      const nextItem = window.blockList[startIndex];
      if (!nextItem.deleted) {
        highlightAndMoveToSelectedItem(nextItem.time);
        return;
      }
    }
  }
}

function highlightAndMoveToSelectedItem(selectedKey) {
  window.selectedItemKey = selectedKey;

  const splaySelectedNode = traverseTree(window.splayHeadNode, (node) => {
    if (node.key === selectedKey) {
      return true;
    }
  });
  const llrbSelectedNode = traverseTree(window.llrbHeadNode, (node) => {
    if (node.key === selectedKey) {
      return true;
    }
  });

  // Displays selected item info.
  displaySelectedItemInfo(splaySelectedNode);
  // Highlights the selected item in the CodeMirror editor.
  highlightCMSelectedItem(splaySelectedNode);
  // Highlights the selected item in the text log, structure data, and tree log.
  highlightSelectedItem(selectedKey);

  // panzoom refresh
  const rootRect = treeArea.getBoundingClientRect();
  moveToSelectedItem(window.splayPanzoomInstance, rootRect, splaySelectedNode);
  moveToSelectedItem(window.llrbPanzoomInstance, rootRect, llrbSelectedNode);
}

function traverseTree(node, callback) {
  if (node.left) {
    const left = traverseTree(node.left, callback);
    if (left) {
      return left;
    }
  }

  if (callback(node)) {
    return node;
  }

  if (node.right) {
    const right = traverseTree(node.right, callback);
    if (right) {
      return right;
    }
  }
}

function displaySelectedItemInfo(node) {
  const element = document.querySelector(`.selected-node-info`);

  if (element) {
    const block = window.blockKeys[node.key];

    element.innerHTML = `
      <div class="property-view">
        <div class="property-item-view"><label>parent:</label> <div class="value">${
          node.parent?.key
        }</div></div>
        <hr />
        <div class="property-item-view"><label>key:</label> <div class="value">${
          node.key
        }</div></div>
        <div class="property-item-view"><label>weight:</label> <div class="value">${
          node.weight
        }</div></div>
        <div class="property-item-view"><label>offset:</label> <div class="value">${
          block ? block.offset : 'deleted'
        }</div></div>
        <div class="property-item-view"><label>value:</label> <div class="value">${displayValue(
          node.value,
        )}</div></div>
        <div class="property-item-view"><label>left:</label> <div class="value">${
          node.left?.key
        }</div></div>
        <div class="property-item-view"><label>right:</label> <div class="value">${
          node.right?.key
        }</div></div>
      </div>`;
  }
}

function highlightCMSelectedItem(selectedItem) {
  if (window.selectedItemMaker) {
    window.selectedItemMaker.clear();
  }

  const block = window.blockKeys[selectedItem.key];
  if (!block) return;

  const cm = window.codemirrorInstance;
  const fromPos = cm.posFromIndex(block.offset);
  const toPos = cm.posFromIndex(block.offset + selectedItem.value.length);
  const color = window.usersInfo[selectedItem.actorID]?.color || 'red';
  window.selectedItemMaker = window.codemirrorInstance.markText(
    fromPos,
    toPos,
    {
      css: `background: ${color}; color: white; border: 2px solid black; box-sizing: border-box; border-radius: 4px; padding: 2px`,
      insertLeft: true,
    },
  );
}

function highlightSelectedItem(selectedKey) {
  if (window.selectedNodeElement) {
    window.selectedNodeElement.classList.remove('selected');
  }
  if (window.llrbselectedNodeElement) {
    window.llrbselectedNodeElement.classList.remove('selected');
  }
  if (window.selectedNodeCharElement) {
    window.selectedNodeCharElement.classList.remove('selected');
  }
  if (window.selectedNodeStructureElement) {
    window.selectedNodeStructureElement.classList.remove('selected');
  }

  window.selectedNodeElement = splaytreeLogHolder.querySelector(
    `.node-item[data-key="${selectedKey}"]`,
  );
  window.llrbselectedNodeElement = llrbtreeLogHolder.querySelector(
    `.node-item[data-key="${selectedKey}"]`,
  );
  window.selectedNodeCharElement = document.querySelector(
    `.char-item[data-time="${selectedKey}"]`,
  );
  window.selectedNodeStructureElement = document.querySelector(
    `.structure-item[data-time="${selectedKey}"]`,
  );

  if (window.selectedNodeElement) {
    window.selectedNodeElement.classList.add('selected');
  }
  if (window.llrbselectedNodeElement) {
    window.llrbselectedNodeElement.classList.add('selected');
  }
  if (window.selectedNodeCharElement) {
    window.selectedNodeCharElement.classList.add('selected');
    window.selectedNodeCharElement.scrollIntoView({
      block: 'center',
      inline: 'center',
    });
  }
  if (window.selectedNodeStructureElement) {
    window.selectedNodeStructureElement.classList.add('selected');
    window.selectedNodeStructureElement.scrollIntoView({
      block: 'center',
      inline: 'center',
    });
  }
}

function moveToSelectedItem(panzoomInstance, rootRect, selectedItem) {
  const trans = panzoomInstance.getTransform();
  const rect = {
    x: selectedItem.viewport.left,
    y: selectedItem.viewport.top,
  };

  panzoomInstance?.moveTo(
    -rect.x * trans.scale + rootRect.width / 2,
    -rect.y * trans.scale + rootRect.height / 2,
  );
}

// ======================================
// ============ UI Control ==============
// ======================================

// Manages tabs within the 'text-view-area', displaying the content of the selected tab.
function openTab(e, target) {
  const tablinks = document.querySelectorAll('.tablinks');
  const tabcontents = document.querySelectorAll('.tabcontent');

  tablinks.forEach((it) => it.classList.remove('active'));
  tabcontents.forEach((it) => it.classList.remove('active'));

  e.target.classList.add('active');
  document.getElementById(target).classList.add('active');
}

// Toggle options in the 'center-tools'.
window.hideDeletedNode = false;
window.hideText = true;
window.hideSplayTree = true;
window.hideLLRBTree = true;

setHideDeletedNode(window.hideDeletedNode);
setHideText(window.hideText);
setHideSplayTree(window.hideSplayTree);
setHideLLRBTree(window.hideLLRBTree);

function toggleDeletedNodeShow() {
  setHideDeletedNode(!window.hideDeletedNode);
}

function toggleText() {
  setHideText(!window.hideText);
}

function toggleSplayTree() {
  setHideSplayTree(!window.hideSplayTree);
}

function toggleLLRBTree() {
  setHideLLRBTree(!window.hideLLRBTree);
}

function setHideDeletedNode(hide) {
  window.hideDeletedNode = hide;

  document.getElementById('hide-deleted-node').checked = window.hideDeletedNode;

  document
    .querySelector('.text-view-area')
    .classList.toggle('hide-deleted-node', window.hideDeletedNode);

  splaytreeLogHolder.classList.toggle(
    'hide-deleted-node',
    window.hideDeletedNode,
  );
  llrbtreeLogHolder.classList.toggle(
    'hide-deleted-node',
    window.hideDeletedNode,
  );
}

function setHideText(hide) {
  window.hideText = hide;

  document.getElementById('hide-text').checked = window.hideText;
  document.getElementById('view-text').style.display = window.hideText
    ? 'block'
    : 'none';

  document
    .getElementById('real-view')
    .classList.toggle('hide-text', !window.hideText);
}

function setHideSplayTree(hide) {
  window.hideSplayTree = hide;

  document.getElementById('hide-splay-tree').checked = window.hideSplayTree;
  document.getElementById('view-splay-tree').style.display =
    window.hideSplayTree ? 'flex' : 'none';

  document
    .getElementById('real-view')
    .classList.toggle('hide-splay-tree', !window.hideSplayTree);
}

function setHideLLRBTree(hide) {
  window.hideLLRBTree = hide;

  document.getElementById('hide-llrb-tree').checked = window.hideLLRBTree;
  document.getElementById('view-llrb-tree').style.display = window.hideLLRBTree
    ? 'flex'
    : 'none';

  document
    .getElementById('real-view')
    .classList.toggle('hide-llrb-tree', !window.hideLLRBTree);
}
