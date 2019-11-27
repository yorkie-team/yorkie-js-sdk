import {
  ActivateClientRequest,
  DeactivateClientRequest
} from './api/yorkie_pb';

import {
  YorkieClient
} from './api/yorkie_grpc_web_pb';

import { uuid } from './util/uuid';

export enum ClientStatus {
  Deactivated = 0,
  Activated = 1
}

export class Client {
  private client: YorkieClient;
  private id: string;
  private key: string;
  private status: ClientStatus;

  constructor(rpcAddr: string, key?: string) {
    this.client = new YorkieClient(rpcAddr, null, null);
    this.key = key ? key : uuid();
    this.status = ClientStatus.Deactivated;
  }

  public activate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = new ActivateClientRequest();
      req.setClientKey(this.key);

      this.client.activateClient(req, {}, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        
        this.id = res.getClientId();
        this.status = ClientStatus.Activated;
        resolve();
      });
    });
  }

  public deactivate(): Promise<void> {
    if (this.status === ClientStatus.Deactivated) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const req = new DeactivateClientRequest();
      req.setClientId(this.id);

      this.client.deactivateClient(req, {}, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        
        this.status = ClientStatus.Deactivated;
        resolve();
      });
    });
  }


  public getID(): string {
    return this.id;
  }

  public getKey(): string {
    return this.key;
  }

  public isActive(): boolean {
    return this.status == ClientStatus.Activated;
  }
}

export default {
  createClient: function(rpcAddr: string, key?: string) {
    return new Client(rpcAddr, key);
  }
}
