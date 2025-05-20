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
 * `docSizeTotal` calculates the total size of a document.
 */
export function docSizeTotal(size: DocSize | undefined): number {
  if (!size) return 0;
  return dataSizeTotal(size.live) + dataSizeTotal(size.gc);
}

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

/**
 * `dataSizeTotal` calculates the total size of a resource.
 */
export function dataSizeTotal(ds: DataSize): number {
  return ds.data + ds.meta;
}

/**
 * `dataSizeAdd` adds the size of a resource to the target resource.
 */
export function dataSizeAdd(target: DataSize, delta: DataSize): void {
  target.data += delta.data;
  target.meta += delta.meta;
}

/**
 * `dataSizeSub` subtracts the size of a resource from the target resource.
 */
export function dataSizeSub(target: DataSize, delta: DataSize): void {
  target.data -= delta.data;
  target.meta -= delta.meta;
}
