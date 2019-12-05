import { Client } from './core/client';
import { Document } from './document/document';

// yorkie namespace.
//  e.g) yorkie.createClient(...)
export default {
  createClient: function(rpcAddr: string, key?: string): Client {
    return new Client(rpcAddr, key);
  },
  createDocument: function(collection: string, document: string): Document {
    return new Document(collection, document);
  }
}
