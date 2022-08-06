/**
 * @fileoverview gRPC-Web generated client stub for yorkie.v1
 * @enhanceable
 * @public
 */

// GENERATED CODE -- DO NOT EDIT!


/* eslint-disable */
// @ts-nocheck



const grpc = {};
grpc.web = require('grpc-web');


var yorkie_v1_resources_pb = require('../../yorkie/v1/resources_pb.js')
const proto = {};
proto.yorkie = {};
proto.yorkie.v1 = require('./yorkie_pb.js');

/**
 * @param {string} hostname
 * @param {?Object} credentials
 * @param {?grpc.web.ClientOptions} options
 * @constructor
 * @struct
 * @final
 */
proto.yorkie.v1.YorkieServiceClient =
    function(hostname, credentials, options) {
  if (!options) options = {};
  options.format = 'text';

  /**
   * @private @const {!grpc.web.GrpcWebClientBase} The client
   */
  this.client_ = new grpc.web.GrpcWebClientBase(options);

  /**
   * @private @const {string} The hostname
   */
  this.hostname_ = hostname;

};


/**
 * @param {string} hostname
 * @param {?Object} credentials
 * @param {?grpc.web.ClientOptions} options
 * @constructor
 * @struct
 * @final
 */
proto.yorkie.v1.YorkieServicePromiseClient =
    function(hostname, credentials, options) {
  if (!options) options = {};
  options.format = 'text';

  /**
   * @private @const {!grpc.web.GrpcWebClientBase} The client
   */
  this.client_ = new grpc.web.GrpcWebClientBase(options);

  /**
   * @private @const {string} The hostname
   */
  this.hostname_ = hostname;

};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.yorkie.v1.ActivateClientRequest,
 *   !proto.yorkie.v1.ActivateClientResponse>}
 */
const methodDescriptor_YorkieService_ActivateClient = new grpc.web.MethodDescriptor(
  '/yorkie.v1.YorkieService/ActivateClient',
  grpc.web.MethodType.UNARY,
  proto.yorkie.v1.ActivateClientRequest,
  proto.yorkie.v1.ActivateClientResponse,
  /**
   * @param {!proto.yorkie.v1.ActivateClientRequest} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.yorkie.v1.ActivateClientResponse.deserializeBinary
);


/**
 * @param {!proto.yorkie.v1.ActivateClientRequest} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @param {function(?grpc.web.RpcError, ?proto.yorkie.v1.ActivateClientResponse)}
 *     callback The callback function(error, response)
 * @return {!grpc.web.ClientReadableStream<!proto.yorkie.v1.ActivateClientResponse>|undefined}
 *     The XHR Node Readable Stream
 */
proto.yorkie.v1.YorkieServiceClient.prototype.activateClient =
    function(request, metadata, callback) {
  return this.client_.rpcCall(this.hostname_ +
      '/yorkie.v1.YorkieService/ActivateClient',
      request,
      metadata || {},
      methodDescriptor_YorkieService_ActivateClient,
      callback);
};


/**
 * @param {!proto.yorkie.v1.ActivateClientRequest} request The
 *     request proto
 * @param {?Object<string, string>=} metadata User defined
 *     call metadata
 * @return {!Promise<!proto.yorkie.v1.ActivateClientResponse>}
 *     Promise that resolves to the response
 */
proto.yorkie.v1.YorkieServicePromiseClient.prototype.activateClient =
    function(request, metadata) {
  return this.client_.unaryCall(this.hostname_ +
      '/yorkie.v1.YorkieService/ActivateClient',
      request,
      metadata || {},
      methodDescriptor_YorkieService_ActivateClient);
};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.yorkie.v1.DeactivateClientRequest,
 *   !proto.yorkie.v1.DeactivateClientResponse>}
 */
const methodDescriptor_YorkieService_DeactivateClient = new grpc.web.MethodDescriptor(
  '/yorkie.v1.YorkieService/DeactivateClient',
  grpc.web.MethodType.UNARY,
  proto.yorkie.v1.DeactivateClientRequest,
  proto.yorkie.v1.DeactivateClientResponse,
  /**
   * @param {!proto.yorkie.v1.DeactivateClientRequest} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.yorkie.v1.DeactivateClientResponse.deserializeBinary
);


/**
 * @param {!proto.yorkie.v1.DeactivateClientRequest} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @param {function(?grpc.web.RpcError, ?proto.yorkie.v1.DeactivateClientResponse)}
 *     callback The callback function(error, response)
 * @return {!grpc.web.ClientReadableStream<!proto.yorkie.v1.DeactivateClientResponse>|undefined}
 *     The XHR Node Readable Stream
 */
proto.yorkie.v1.YorkieServiceClient.prototype.deactivateClient =
    function(request, metadata, callback) {
  return this.client_.rpcCall(this.hostname_ +
      '/yorkie.v1.YorkieService/DeactivateClient',
      request,
      metadata || {},
      methodDescriptor_YorkieService_DeactivateClient,
      callback);
};


/**
 * @param {!proto.yorkie.v1.DeactivateClientRequest} request The
 *     request proto
 * @param {?Object<string, string>=} metadata User defined
 *     call metadata
 * @return {!Promise<!proto.yorkie.v1.DeactivateClientResponse>}
 *     Promise that resolves to the response
 */
proto.yorkie.v1.YorkieServicePromiseClient.prototype.deactivateClient =
    function(request, metadata) {
  return this.client_.unaryCall(this.hostname_ +
      '/yorkie.v1.YorkieService/DeactivateClient',
      request,
      metadata || {},
      methodDescriptor_YorkieService_DeactivateClient);
};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.yorkie.v1.UpdatePresenceRequest,
 *   !proto.yorkie.v1.UpdatePresenceResponse>}
 */
const methodDescriptor_YorkieService_UpdatePresence = new grpc.web.MethodDescriptor(
  '/yorkie.v1.YorkieService/UpdatePresence',
  grpc.web.MethodType.UNARY,
  proto.yorkie.v1.UpdatePresenceRequest,
  proto.yorkie.v1.UpdatePresenceResponse,
  /**
   * @param {!proto.yorkie.v1.UpdatePresenceRequest} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.yorkie.v1.UpdatePresenceResponse.deserializeBinary
);


/**
 * @param {!proto.yorkie.v1.UpdatePresenceRequest} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @param {function(?grpc.web.RpcError, ?proto.yorkie.v1.UpdatePresenceResponse)}
 *     callback The callback function(error, response)
 * @return {!grpc.web.ClientReadableStream<!proto.yorkie.v1.UpdatePresenceResponse>|undefined}
 *     The XHR Node Readable Stream
 */
proto.yorkie.v1.YorkieServiceClient.prototype.updatePresence =
    function(request, metadata, callback) {
  return this.client_.rpcCall(this.hostname_ +
      '/yorkie.v1.YorkieService/UpdatePresence',
      request,
      metadata || {},
      methodDescriptor_YorkieService_UpdatePresence,
      callback);
};


/**
 * @param {!proto.yorkie.v1.UpdatePresenceRequest} request The
 *     request proto
 * @param {?Object<string, string>=} metadata User defined
 *     call metadata
 * @return {!Promise<!proto.yorkie.v1.UpdatePresenceResponse>}
 *     Promise that resolves to the response
 */
proto.yorkie.v1.YorkieServicePromiseClient.prototype.updatePresence =
    function(request, metadata) {
  return this.client_.unaryCall(this.hostname_ +
      '/yorkie.v1.YorkieService/UpdatePresence',
      request,
      metadata || {},
      methodDescriptor_YorkieService_UpdatePresence);
};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.yorkie.v1.AttachDocumentRequest,
 *   !proto.yorkie.v1.AttachDocumentResponse>}
 */
const methodDescriptor_YorkieService_AttachDocument = new grpc.web.MethodDescriptor(
  '/yorkie.v1.YorkieService/AttachDocument',
  grpc.web.MethodType.UNARY,
  proto.yorkie.v1.AttachDocumentRequest,
  proto.yorkie.v1.AttachDocumentResponse,
  /**
   * @param {!proto.yorkie.v1.AttachDocumentRequest} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.yorkie.v1.AttachDocumentResponse.deserializeBinary
);


/**
 * @param {!proto.yorkie.v1.AttachDocumentRequest} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @param {function(?grpc.web.RpcError, ?proto.yorkie.v1.AttachDocumentResponse)}
 *     callback The callback function(error, response)
 * @return {!grpc.web.ClientReadableStream<!proto.yorkie.v1.AttachDocumentResponse>|undefined}
 *     The XHR Node Readable Stream
 */
proto.yorkie.v1.YorkieServiceClient.prototype.attachDocument =
    function(request, metadata, callback) {
  return this.client_.rpcCall(this.hostname_ +
      '/yorkie.v1.YorkieService/AttachDocument',
      request,
      metadata || {},
      methodDescriptor_YorkieService_AttachDocument,
      callback);
};


/**
 * @param {!proto.yorkie.v1.AttachDocumentRequest} request The
 *     request proto
 * @param {?Object<string, string>=} metadata User defined
 *     call metadata
 * @return {!Promise<!proto.yorkie.v1.AttachDocumentResponse>}
 *     Promise that resolves to the response
 */
proto.yorkie.v1.YorkieServicePromiseClient.prototype.attachDocument =
    function(request, metadata) {
  return this.client_.unaryCall(this.hostname_ +
      '/yorkie.v1.YorkieService/AttachDocument',
      request,
      metadata || {},
      methodDescriptor_YorkieService_AttachDocument);
};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.yorkie.v1.DetachDocumentRequest,
 *   !proto.yorkie.v1.DetachDocumentResponse>}
 */
const methodDescriptor_YorkieService_DetachDocument = new grpc.web.MethodDescriptor(
  '/yorkie.v1.YorkieService/DetachDocument',
  grpc.web.MethodType.UNARY,
  proto.yorkie.v1.DetachDocumentRequest,
  proto.yorkie.v1.DetachDocumentResponse,
  /**
   * @param {!proto.yorkie.v1.DetachDocumentRequest} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.yorkie.v1.DetachDocumentResponse.deserializeBinary
);


/**
 * @param {!proto.yorkie.v1.DetachDocumentRequest} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @param {function(?grpc.web.RpcError, ?proto.yorkie.v1.DetachDocumentResponse)}
 *     callback The callback function(error, response)
 * @return {!grpc.web.ClientReadableStream<!proto.yorkie.v1.DetachDocumentResponse>|undefined}
 *     The XHR Node Readable Stream
 */
proto.yorkie.v1.YorkieServiceClient.prototype.detachDocument =
    function(request, metadata, callback) {
  return this.client_.rpcCall(this.hostname_ +
      '/yorkie.v1.YorkieService/DetachDocument',
      request,
      metadata || {},
      methodDescriptor_YorkieService_DetachDocument,
      callback);
};


/**
 * @param {!proto.yorkie.v1.DetachDocumentRequest} request The
 *     request proto
 * @param {?Object<string, string>=} metadata User defined
 *     call metadata
 * @return {!Promise<!proto.yorkie.v1.DetachDocumentResponse>}
 *     Promise that resolves to the response
 */
proto.yorkie.v1.YorkieServicePromiseClient.prototype.detachDocument =
    function(request, metadata) {
  return this.client_.unaryCall(this.hostname_ +
      '/yorkie.v1.YorkieService/DetachDocument',
      request,
      metadata || {},
      methodDescriptor_YorkieService_DetachDocument);
};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.yorkie.v1.WatchDocumentsRequest,
 *   !proto.yorkie.v1.WatchDocumentsResponse>}
 */
const methodDescriptor_YorkieService_WatchDocuments = new grpc.web.MethodDescriptor(
  '/yorkie.v1.YorkieService/WatchDocuments',
  grpc.web.MethodType.SERVER_STREAMING,
  proto.yorkie.v1.WatchDocumentsRequest,
  proto.yorkie.v1.WatchDocumentsResponse,
  /**
   * @param {!proto.yorkie.v1.WatchDocumentsRequest} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.yorkie.v1.WatchDocumentsResponse.deserializeBinary
);


/**
 * @param {!proto.yorkie.v1.WatchDocumentsRequest} request The request proto
 * @param {?Object<string, string>=} metadata User defined
 *     call metadata
 * @return {!grpc.web.ClientReadableStream<!proto.yorkie.v1.WatchDocumentsResponse>}
 *     The XHR Node Readable Stream
 */
proto.yorkie.v1.YorkieServiceClient.prototype.watchDocuments =
    function(request, metadata) {
  return this.client_.serverStreaming(this.hostname_ +
      '/yorkie.v1.YorkieService/WatchDocuments',
      request,
      metadata || {},
      methodDescriptor_YorkieService_WatchDocuments);
};


/**
 * @param {!proto.yorkie.v1.WatchDocumentsRequest} request The request proto
 * @param {?Object<string, string>=} metadata User defined
 *     call metadata
 * @return {!grpc.web.ClientReadableStream<!proto.yorkie.v1.WatchDocumentsResponse>}
 *     The XHR Node Readable Stream
 */
proto.yorkie.v1.YorkieServicePromiseClient.prototype.watchDocuments =
    function(request, metadata) {
  return this.client_.serverStreaming(this.hostname_ +
      '/yorkie.v1.YorkieService/WatchDocuments',
      request,
      metadata || {},
      methodDescriptor_YorkieService_WatchDocuments);
};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.yorkie.v1.PushPullRequest,
 *   !proto.yorkie.v1.PushPullResponse>}
 */
const methodDescriptor_YorkieService_PushPull = new grpc.web.MethodDescriptor(
  '/yorkie.v1.YorkieService/PushPull',
  grpc.web.MethodType.UNARY,
  proto.yorkie.v1.PushPullRequest,
  proto.yorkie.v1.PushPullResponse,
  /**
   * @param {!proto.yorkie.v1.PushPullRequest} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.yorkie.v1.PushPullResponse.deserializeBinary
);


/**
 * @param {!proto.yorkie.v1.PushPullRequest} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @param {function(?grpc.web.RpcError, ?proto.yorkie.v1.PushPullResponse)}
 *     callback The callback function(error, response)
 * @return {!grpc.web.ClientReadableStream<!proto.yorkie.v1.PushPullResponse>|undefined}
 *     The XHR Node Readable Stream
 */
proto.yorkie.v1.YorkieServiceClient.prototype.pushPull =
    function(request, metadata, callback) {
  return this.client_.rpcCall(this.hostname_ +
      '/yorkie.v1.YorkieService/PushPull',
      request,
      metadata || {},
      methodDescriptor_YorkieService_PushPull,
      callback);
};


/**
 * @param {!proto.yorkie.v1.PushPullRequest} request The
 *     request proto
 * @param {?Object<string, string>=} metadata User defined
 *     call metadata
 * @return {!Promise<!proto.yorkie.v1.PushPullResponse>}
 *     Promise that resolves to the response
 */
proto.yorkie.v1.YorkieServicePromiseClient.prototype.pushPull =
    function(request, metadata) {
  return this.client_.unaryCall(this.hostname_ +
      '/yorkie.v1.YorkieService/PushPull',
      request,
      metadata || {},
      methodDescriptor_YorkieService_PushPull);
};


module.exports = proto.yorkie.v1;

