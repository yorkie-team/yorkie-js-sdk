const clientElem = document.getElementById('client');
const documentKey = 'multi-example';

const statusHolder = document.getElementById('network-status');
const placeholder = document.getElementById('placeholder');
const onlineClientsHolder = document.getElementById('online-clients');
const logHolder = document.getElementById('log-holder');
const shortUniqueID = new ShortUniqueId();
const colorHash = new ColorHash();
const counter = document.querySelector('.count');
const counterIncreaseButton = document.querySelector('.increaseButton');
const todoList = document.querySelector('.todoList');
const todoInput = document.querySelector('.todoInput');
const addTodoButton = document.querySelector('.addButton');

const changeHistoryList = document.getElementById('change-history-list');
const versionSlider = document.getElementById('version-slider');
const sliderVersionText = document.getElementById('slider-version-text');
const currentVersionText = document.getElementById('current-version-text');
const autoTravelBtn = document.getElementById('auto-travel');
const renewHistoryBtn = document.getElementById('renew-history');
const timeTravelBtn = document.getElementById('time-travel');

function displayOnlineClients(presences, myClientID) {
  const usernames = [];
  for (const { clientID, presence } of presences) {
    usernames.push(
      myClientID === clientID
      ? `<b>${presence.username.slice(-4)}</b>`
      : presence.username.slice(-4),
    );
  }
  onlineClientsHolder.innerHTML = JSON.stringify(usernames);
}


async function main() {
  try {
    // 01-1. create client with RPCAddr.
    const client = new yorkie.Client('http://localhost:8080');
    // 01-2. activate client
    await client.activate();
    const clientID = client.getID().slice(-4);
    clientElem.querySelector('.client-id').textContent = clientID;
    
    // 02. create a document then attach it into the client.
    const doc = new yorkie.Document('time-travel-example', {
      enableDevtools: true,
    });
    doc.subscribe('connection', new Network(statusHolder).statusListener);
    doc.subscribe('presence', (event) => {
      if (event.type === 'presence-changed') return;
      displayOnlineClients(doc.getPresences(), client.getID());
    });


    doc.subscribe((event) => {
      console.log('🟢 doc event', event);
      if (event.type === 'snapshot') {    // remote snapshot or local travel
        if (event.source !== 'timetravel') {
          // update history content UI
          // displayUI();
        }
        // update UI components
        // update history UI style
        displayUI();
      }
      displayHistory();
      displayVersion();
      displayLog();
    });

    // 07. for every events that changes localChanges or localHistory or remoteHistory,
    // update changeHistoryList
    
    function displayLog() {
      logHolder.innerHTML = JSON.stringify(doc.getRoot().toJS(), null, 2);
    }

    const displayCount = () => {
      counter.textContent = doc.getValueByPath('$.counter').getValue();
      // you can also get the value as follows:
      // doc.getRoot().counter.getValue();
    };

    function displayTodos() {
      todoList.innerHTML = '';
      doc.getValueByPath('$.todos').forEach((todo) => {
        addTodo(todo);
      });
    }

    function displayVersion() {
      const sliderVersion = doc.getVersionFromHistoryIndex(versionSlider.value);
      sliderVersionText.textContent = sliderVersion.toTestString();
      currentVersionText.textContent = doc.getVersion().toTestString();
    }

    function displayHistory() {
      const changeHistory = doc.getChangeHistory();
      const wasLatest = (versionSlider.value === versionSlider.max);
      versionSlider.min = 0;
      versionSlider.max = changeHistory.length - 1;
      // if(doc.isLatestVersion()) {
      if(wasLatest) {
        versionSlider.value = changeHistory.length - 1;
      }

      changeHistoryList.innerHTML = '';
      for (const change of changeHistory) {
        const id = change.getID().toUniqueString();
        if(changeHistoryList.querySelector(`#${id}`)) continue;
        
        const span = document.createElement('span');
        span.id = id;
        changeHistoryList.appendChild(span);
      }
      updateHistoryStyle(doc.getVersion());
    }
    
    function displayUI() {
      displayCount();
      displayTodos();
      displayVersion();
    }

    function addTodo(text) {
      const newTodo = document.createElement('li');
      newTodo.classList.add('todoItem');
      newTodo.innerHTML = `
          <button class="moveUp">⬆</button>
          <button class="moveDown">⬇</button>
          <span class="itemName">${text}</span>
          <button class="trash">🗑</button></li>
        `;
      todoList.appendChild(newTodo);
    }

    
    await client.attach(doc, {
      initialPresence: { username: `user-${client.getID()}` },
    });

    initDoc(doc);
    initCounter(doc, displayCount);
    initTodos(doc, displayTodos, addTodo)
    initSyncOption(doc, client);

    autoTravelBtn.addEventListener('click', (e) => {
      timeTravelBtn.disabled = e.target.checked;
    });
    renewHistoryBtn.addEventListener('click', () => {
      displayHistory();
      displayVersion();
    });
    timeTravelBtn.addEventListener('click', () => {
      const sliderVersion = doc.getVersionFromHistoryIndex(versionSlider.value);
      doc.timeTravel(sliderVersion);
    });

    versionSlider.addEventListener('input', (e) => {
      const historyIdx = e.target.value;
      const version = doc.getVersionFromHistoryIndex(historyIdx);
      console.debug('version:', version);
      sliderVersionText.textContent = version.toTestString();

      updateHistoryStyle(version);
      if(autoTravelBtn.checked) {
        doc.timeTravel(version);
      }
    });

    function updateHistoryStyle(version) {
      const changeHistory = doc.getChangeHistory();
      for (const change of changeHistory) {
        const span = document.getElementById(change.getID().toUniqueString());
        if(!span) {
          console.debug('span not found', change.getID().toUniqueString());
        }
        const isLocal = change.getID().getActorID() === client.getID();
        const isCovered = version.coversChangeID(change.getID());
        const isPushed = change.getID().hasServerSeq();
        
        span.textContent = `${isPushed ? change.getID().getServerSeq() : '#'+change.getID().getClientSeq()}`;
        span.classList.remove('local', 'remote', 'covered', 'not-covered');
        span.classList.add(isLocal ? 'local' : 'remote');
        span.classList.add(isCovered ? 'covered' : 'not-covered');
      }
    }

    displayUI();
    displayHistory();
    displayLog();
    
    window.addEventListener('beforeunload', async () => {
      await client.deactivate();
    });
  } catch (e) {
    console.error(e);
  }
}

function initDoc(doc) {
  doc.update((root) => {
    if (!root.counter) {
      root.counter = new yorkie.Counter(yorkie.IntType, 0);
      root.todos = [];
      root.content = new yorkie.Text();
      root.content.edit(0, 0, '\n');
      root.obj = {
        name: 'josh',
        age: 14,
        food: ['🍇', '🍌', '🍏'],
        score: {
          english: 80,
          math: 90,
        },
      };
      root.obj.score = { science: 100 };
      delete root.obj.food;
    }
  }, 'initaialize doc');
}

function initCounter(doc, displayCount) {
  // 03. Counter example
  doc.subscribe('$.counter', (event) => {
    console.log('🟣 counter event', event);
    displayCount();
  });
  
  counterIncreaseButton.onclick = () => {
    doc.update((root) => {
      root.counter.increase(1);
    });
  };
}

function initTodos(doc, displayTodos, addTodo) {
  // 04. Todo example
  doc.subscribe('$.todos', (event) => {
    console.log('🟡 todos event', event);
    
    const { message, operations } = event.value;
    for (const op of operations) {
      const { type, path, index } = op;
      switch (type) {
        case 'add':
        const value = doc.getValueByPath(`${path}.${index}`);
        addTodo(value);
        break;
        default:
        displayTodos();
        break;
      }
    }
    
    if (event.type === 'local-change') {
      todoInput.value = '';
      todoInput.focus();
    }
  });
  
  function handleAddTodo() {
    const text = todoInput.value;
    if (text === '') {
      todoInput.focus();
      return;
    }
    doc.update((root) => {
      root.todos.push(text);
    });
  }
  
  addTodoButton.addEventListener('click', handleAddTodo);
  todoInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      handleAddTodo();
    }
  });
  todoList.addEventListener('click', function (e) {
    if (e.target.classList.contains('trash')) {
      const li = e.target.parentNode;
      const idx = Array.from(li.parentNode.children).indexOf(li);
      doc.update((root) => {
        const todoID = root.todos.getElementByIndex(idx).getID();
        root.todos.deleteByID(todoID);
      });
      return;
    }
    if (e.target.classList.contains('moveUp')) {
      const li = e.target.parentNode;
      const idx = Array.from(li.parentNode.children).indexOf(li);
      if (idx === 0) return;
      doc.update((root) => {
        const nextItem = root.todos.getElementByIndex(idx - 1);
        const currItem = root.todos.getElementByIndex(idx);
        root.todos.moveBefore(nextItem.getID(), currItem.getID());
      });
      return;
    }
    if (e.target.classList.contains('moveDown')) {
      const li = e.target.parentNode;
      const idx = Array.from(li.parentNode.children).indexOf(li);
      if (idx === doc.getRoot().todos.length - 1) return;
      doc.update((root) => {
        const prevItem = root.todos.getElementByIndex(idx + 1);
        const currItem = root.todos.getElementByIndex(idx);
        root.todos.moveAfter(prevItem.getID(), currItem.getID());
      });
      return;
    }
  });
}

function initSyncOption(doc, client) {
  // 06. sync option
  const option = clientElem.querySelector('.syncmode-option');
  option.addEventListener('change', async (e) => {
    if (!e.target.matches('input[type="radio"]')) {
      return;
    }
    const syncMode = e.target.value;
    switch (syncMode) {
      case 'pushpull':
      await client.changeSyncMode(doc, 'realtime');
      break;
      case 'pushonly':
      await client.changeSyncMode(doc, 'realtime-pushonly');
      break;
      case 'syncoff':
      await client.changeSyncMode(doc, 'realtime-syncoff');
      break;
      case 'manual':
      await client.changeSyncMode(doc, 'manual');
      break;
      default:
      break;
    }
  });
  const syncButton = clientElem.querySelector('.manual-sync');
  syncButton.addEventListener('click', async () => {
    await client.sync(doc);
  });
}