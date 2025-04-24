/**
 * `DocSize` represents the size of a document in bytes.
 */
export type DocSize = {
  /**
   * `live` is the size of the document in bytes.
   */
  live: DataSize;

  /**
   * `gc` is the size of the garbage collected data in bytes.
   */
  gc: DataSize;
};

/**
 * `DataSize` represents the size of a resource in bytes.
 */
export type DataSize = {
  /**
   * `data` is the size of the data in bytes.
   */
  data: number;

  /**
   * `meta` is the size of the metadata in bytes.
   */
  meta: number;
};
