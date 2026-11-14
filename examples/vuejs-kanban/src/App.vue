<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import yorkie from '@yorkie-js/sdk';

const rpcAddr = import.meta.env.VITE_YORKIE_API_ADDR;
const names = ['Otter', 'Fox', 'Panda', 'Koala', 'Heron', 'Lynx', 'Robin'];
const peerColors = [
  '#fc8539',
  '#fdc433',
  '#23c176',
  '#3c9af1',
  '#f44954',
  '#855cf9',
];
const maxAvatars = 4;
const pageURL = window.location.href;

const initialRoot = {
  lists: [
    {
      title: 'To do',
      cards: [
        { title: 'Draft the launch announcement' },
        { title: 'Pick a date for the team offsite' },
      ],
    },
    {
      title: 'In progress',
      cards: [{ title: 'Redesign the pricing page' }],
    },
    {
      title: 'Done',
      cards: [
        { title: 'Set up the project board' },
        { title: 'Invite the team' },
      ],
    },
  ],
};

const client = new yorkie.Client({
  rpcAddr,
  apiKey: import.meta.env.VITE_YORKIE_API_KEY,
});
// A new board starts every day (the key ends in YYYYMMDD), so the public
// demo resets to the seed cards instead of collecting edits forever.
const doc = new yorkie.Document(
  `vuejs-kanban-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}`,
  { enableDevtools: import.meta.env.DEV },
);

// `lists` holds the Yorkie proxy. A shallowRef keeps Vue from wrapping it;
// we assign a fresh root after every change to re-render.
const lists = shallowRef(null);
const presences = shallowRef([]);
const status = ref('connecting'); // connecting, connected, offline, error
const opened = ref(null); // the list whose form is open, or 'list'
const title = ref('');
const dragging = shallowRef(null);
const unsubscribers = [];

const idOf = (element) => element.getID().toIDString();
const statusLabels = {
  connecting: 'Connecting…',
  connected: 'Connected',
  offline: 'Offline',
  error: 'Error',
};

// `peerColor` derives a colour from the client ID, so every tab agrees.
function peerColor(clientID) {
  let hash = 0;
  for (const ch of clientID) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return peerColors[Math.abs(hash) % peerColors.length];
}

const peers = computed(() => {
  const myID = client.getActorID();
  return presences.value
    .map(({ clientID, presence }) => ({
      clientID,
      name: presence.name,
      color: peerColor(clientID),
      isMe: clientID === myID,
    }))
    .sort((a, b) => b.isMe - a.isMe);
});

onMounted(async () => {
  try {
    await client.activate();
    unsubscribers.push(
      doc.subscribe(() => (lists.value = doc.getRoot().lists)),
      doc.subscribe('presence', () => (presences.value = doc.getPresences())),
      doc.subscribe('connection', (event) => {
        status.value = event.value === 'connected' ? 'connected' : 'offline';
      }),
    );
    await client.attach(doc, {
      initialRoot,
      initialPresence: {
        name: names[Math.floor(Math.random() * names.length)],
      },
    });
    lists.value = doc.getRoot().lists;
    presences.value = doc.getPresences();
  } catch {
    status.value = 'error';
  }
});

onBeforeUnmount(async () => {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  if (client.has(doc.getKey())) await client.detach(doc);
  if (client.isActive()) await client.deactivate();
});

function openForm(target) {
  opened.value = target;
  title.value = '';
}

function closeForm() {
  opened.value = null;
}

// Focus the title input as soon as a form opens.
const vFocus = { mounted: (el) => el.focus() };

function addCard(list) {
  const cardTitle = title.value.trim();
  if (!cardTitle) return;
  doc.update((root) => {
    root.lists.getElementByID(list.getID()).cards.push({ title: cardTitle });
  }, 'add a card');
  title.value = '';
}

function addList() {
  const listTitle = title.value.trim();
  if (!listTitle) return;
  doc.update((root) => {
    root.lists.push({ title: listTitle, cards: [] });
  }, 'add a list');
  title.value = '';
}

function deleteCard(list, card) {
  doc.update((root) => {
    root.lists.getElementByID(list.getID()).cards.deleteByID(card.getID());
  }, 'delete a card');
}

function deleteList(list) {
  doc.update((root) => {
    root.lists.deleteByID(list.getID());
  }, 'delete a list');
}

// `moveCard` moves a card before `beforeCard`, or to the end of `toList`.
// moveBefore/moveLast reorder elements inside one array. An element can't
// move between arrays, so a card that changes lists is deleted from one
// and re-created in the other, in a single update so peers see one move.
function moveCard(card, fromList, toList, beforeCard) {
  if (beforeCard && idOf(beforeCard) === idOf(card)) return;
  doc.update((root) => {
    const from = root.lists.getElementByID(fromList.getID()).cards;
    const to = root.lists.getElementByID(toList.getID()).cards;
    if (idOf(fromList) === idOf(toList)) {
      if (beforeCard) to.moveBefore(beforeCard.getID(), card.getID());
      else to.moveLast(card.getID());
      return;
    }
    from.deleteByID(card.getID());
    if (beforeCard) to.insertBefore(beforeCard.getID(), { title: card.title });
    else to.push({ title: card.title });
  }, 'move a card');
}

function onMoveSelect(card, fromList, event) {
  const toList = [...lists.value].find((l) => idOf(l) === event.target.value);
  event.target.value = '';
  if (toList) moveCard(card, fromList, toList);
}

function onDragStart(event, card, list) {
  // Firefox only starts a drag when some data is set.
  event.dataTransfer.setData('text/plain', card.title);
  dragging.value = { card, list };
}

function onDrop(toList, beforeCard) {
  if (!dragging.value) return;
  const { card, list } = dragging.value;
  dragging.value = null;
  moveCard(card, list, toList, beforeCard);
}
</script>

<template>
  <header class="header">
    <div class="header-text">
      <h1 class="header-title">Vue Kanban</h1>
      <p class="header-hint">
        Add, move and delete cards together:
        <a :href="pageURL" target="_blank">open this board in another tab</a>
        to see changes sync.
      </p>
    </div>
    <div class="header-meta">
      <span class="status" :data-status="status">
        <span class="status-dot" aria-hidden="true" />
        {{ statusLabels[status] }}
      </span>
      <ul
        v-if="peers.length"
        class="avatars"
        :aria-label="`${peers.length} online`"
      >
        <li
          v-for="peer in peers.slice(0, maxAvatars)"
          :key="peer.clientID"
          class="avatar"
          :data-me="peer.isMe"
          :style="{ background: peer.color }"
          :title="peer.isMe ? 'You' : peer.name"
        >
          {{ peer.name?.[0] }}
        </li>
        <li
          v-if="peers.length > maxAvatars"
          class="avatar avatar-more"
          :title="`${peers.length - maxAvatars} more`"
        >
          +{{ peers.length - maxAvatars }}
        </li>
      </ul>
    </div>
  </header>

  <main class="board">
    <p v-if="status === 'error'" class="message" role="alert">
      Couldn’t reach the Yorkie server at {{ rpcAddr }}. Check that it’s
      running, then reload.
    </p>
    <p v-else-if="!lists" class="message">Loading the board…</p>
    <template v-else>
      <section
        v-for="list in lists"
        :key="idOf(list)"
        class="list"
        :aria-label="list.title"
        @dragover.prevent
        @drop.prevent="onDrop(list)"
      >
        <div class="list-header">
          <h2 class="list-title">{{ list.title }}</h2>
          <button
            type="button"
            class="icon-button"
            :aria-label="`Delete list ${list.title}`"
            title="Delete list"
            @click="deleteList(list)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>

        <ul class="cards">
          <li
            v-for="card in list.cards"
            :key="idOf(card)"
            class="card"
            draggable="true"
            @dragstart="onDragStart($event, card, list)"
            @dragend="dragging = null"
            @dragover.prevent
            @drop.prevent.stop="onDrop(list, card)"
          >
            <span class="card-title">{{ card.title }}</span>
            <div class="card-actions">
              <select
                v-if="lists.length > 1"
                class="move-select"
                :aria-label="`Move ${card.title} to another list`"
                @change="onMoveSelect(card, list, $event)"
              >
                <option value="">Move to…</option>
                <template v-for="target in lists" :key="idOf(target)">
                  <option
                    v-if="idOf(target) !== idOf(list)"
                    :value="idOf(target)"
                  >
                    {{ target.title }}
                  </option>
                </template>
              </select>
              <button
                type="button"
                class="icon-button"
                :aria-label="`Delete card ${card.title}`"
                title="Delete card"
                @click="deleteCard(list, card)"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </div>
          </li>
          <li v-if="list.cards.length === 0" class="empty">
            No cards yet. Add one, or drop a card here.
          </li>
        </ul>

        <form
          v-if="opened === idOf(list)"
          class="add-form"
          @submit.prevent="addCard(list)"
        >
          <input
            v-model="title"
            v-focus
            type="text"
            placeholder="Card title"
            :aria-label="`New card in ${list.title}`"
            @keyup.esc="closeForm"
          />
          <div class="form-buttons">
            <button
              type="submit"
              class="button-primary"
              :disabled="!title.trim()"
            >
              Add card
            </button>
            <button type="button" class="button" @click="closeForm">
              Cancel
            </button>
          </div>
        </form>
        <button
          v-else
          type="button"
          class="add-opener"
          @click="openForm(idOf(list))"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
          Add a card
        </button>
      </section>

      <section class="list list-new" aria-label="New list">
        <form
          v-if="opened === 'list'"
          class="add-form"
          @submit.prevent="addList"
        >
          <input
            v-model="title"
            v-focus
            type="text"
            placeholder="List title"
            aria-label="New list title"
            @keyup.esc="closeForm"
          />
          <div class="form-buttons">
            <button
              type="submit"
              class="button-primary"
              :disabled="!title.trim()"
            >
              Add list
            </button>
            <button type="button" class="button" @click="closeForm">
              Cancel
            </button>
          </div>
        </form>
        <button
          v-else
          type="button"
          class="add-opener"
          @click="openForm('list')"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
          Add another list
        </button>
      </section>
    </template>
  </main>
</template>
