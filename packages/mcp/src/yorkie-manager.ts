import yorkie, {
  Client,
  Document,
  SyncMode,
  type Indexable,
} from '@yorkie-js/sdk';

/**
 * Document info stored in the manager
 */
interface DocumentInfo {
  document: Document<Indexable, Indexable>;
  attachedAt: Date;
}

/**
 * YorkieManager handles client lifecycle and document management
 * for the MCP server.
 */
export class YorkieManager {
  private client: Client | undefined = undefined;
  private documents: Map<string, DocumentInfo> = new Map();
  private apiUrl: string;
  private apiKey: string | undefined;

  constructor(apiUrl: string, apiKey?: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  /**
   * Ensures the client is activated
   */
  async ensureClient(): Promise<Client> {
    if (this.client && this.client.isActive()) {
      return this.client;
    }

    this.client = new yorkie.Client({
      rpcAddr: this.apiUrl,
      apiKey: this.apiKey,
    });

    await this.client.activate();
    return this.client;
  }

  /**
   * Gets the current client status
   */
  getClientStatus(): { active: boolean; id?: string } {
    if (!this.client) {
      return { active: false };
    }
    return {
      active: this.client.isActive(),
      id: this.client.getID(),
    };
  }

  /**
   * Deactivates the client and detaches all documents
   */
  async deactivate(): Promise<void> {
    if (this.client === undefined) return;

    // Detach all documents first
    for (const [key, info] of this.documents) {
      try {
        await this.client.detach(info.document);
      } catch (error) {
        console.error(`Error detaching document ${key}:`, error);
      }
    }
    this.documents.clear();

    await this.client.deactivate();
    this.client = undefined;
  }

  /**
   * Attaches to a document
   */
  async attachDocument(
    documentKey: string,
    options?: {
      initialRoot?: Indexable;
      syncMode?: 'manual' | 'realtime';
    },
  ): Promise<Document<Indexable, Indexable>> {
    const client = await this.ensureClient();

    // Check if already attached
    const existing = this.documents.get(documentKey);
    if (existing) {
      return existing.document;
    }

    const doc = new yorkie.Document<Indexable, Indexable>(documentKey);

    await client.attach(doc, {
      initialRoot: options?.initialRoot,
      syncMode:
        options?.syncMode === 'manual' ? SyncMode.Manual : SyncMode.Realtime,
    });

    this.documents.set(documentKey, {
      document: doc,
      attachedAt: new Date(),
    });

    return doc;
  }

  /**
   * Gets an attached document
   */
  getDocument(documentKey: string): Document<Indexable, Indexable> | undefined {
    const info = this.documents.get(documentKey);
    return info ? info.document : undefined;
  }

  /**
   * Detaches from a document
   */
  async detachDocument(documentKey: string): Promise<boolean> {
    const client = await this.ensureClient();
    const info = this.documents.get(documentKey);

    if (!info) {
      return false;
    }

    await client.detach(info.document);
    this.documents.delete(documentKey);
    return true;
  }

  /**
   * Lists all attached documents
   */
  listAttachedDocuments(): Array<{
    key: string;
    attachedAt: Date;
    hasLocalChanges: boolean;
  }> {
    const result: Array<{
      key: string;
      attachedAt: Date;
      hasLocalChanges: boolean;
    }> = [];

    for (const [key, info] of this.documents) {
      result.push({
        key,
        attachedAt: info.attachedAt,
        hasLocalChanges: info.document.hasLocalChanges(),
      });
    }

    return result;
  }

  /**
   * Updates a document with the given updater function
   */
  async updateDocument(
    documentKey: string,
    updates: Record<string, unknown>,
    message?: string,
  ): Promise<boolean> {
    const doc = this.getDocument(documentKey);
    if (!doc) {
      return false;
    }

    doc.update((root) => {
      for (const [key, value] of Object.entries(updates)) {
        (root as Record<string, unknown>)[key] = value;
      }
    }, message);

    return true;
  }

  /**
   * Syncs a document with the server
   */
  async syncDocument(documentKey: string): Promise<boolean> {
    const client = await this.ensureClient();
    const doc = this.getDocument(documentKey);

    if (!doc) {
      return false;
    }

    await client.sync(doc);
    return true;
  }

  /**
   * Gets the root content of a document as JSON
   */
  getDocumentContent(documentKey: string): unknown | undefined {
    const doc = this.getDocument(documentKey);
    if (!doc) {
      return undefined;
    }

    const root = doc.getRoot();
    return root.toJSON ? root.toJSON() : root;
  }

  /**
   * Gets presence information for a document
   */
  getDocumentPresences(
    documentKey: string,
  ): Array<{ clientId: string; presence: unknown }> | undefined {
    const doc = this.getDocument(documentKey);
    if (!doc) {
      return undefined;
    }

    // getPresences returns Array<{ clientID: ActorID; presence: P }>
    const presences = doc.getPresences();
    return presences.map((p) => ({
      clientId: p.clientID,
      presence: p.presence,
    }));
  }

  /**
   * Creates a revision (checkpoint) for a document
   */
  async createRevision(
    documentKey: string,
    label: string,
    description?: string,
  ): Promise<{ revisionId: string } | undefined> {
    const client = await this.ensureClient();
    const doc = this.getDocument(documentKey);

    if (!doc) {
      return undefined;
    }

    const revision = await client.createRevision(doc, label, description);
    return { revisionId: revision.id };
  }

  /**
   * Lists revisions for a document
   */
  async listRevisions(
    documentKey: string,
  ): Promise<
    | Array<{ id: string; label: string; description: string; createdAt: Date }>
    | undefined
  > {
    const client = await this.ensureClient();
    const doc = this.getDocument(documentKey);

    if (!doc) {
      return undefined;
    }

    const revisions = await client.listRevisions(doc);
    return revisions.map((rev) => ({
      id: rev.id,
      label: rev.label,
      description: rev.description,
      createdAt: rev.createdAt,
    }));
  }
}
