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
 * `totalDocSize` calculates the total size of a document.
 */
export function totalDocSize(d: DocSize | undefined): number {
  if (!d) return 0;
  return totalDataSize(d.live) + totalDataSize(d.gc);
}

/**
 * `DataSize` represents the size of a resource in bytes.
 */
const textEncoder = new TextEncoder();

/**
 * `utf8Length` returns the number of UTF-8 bytes in the given string, which is
 * what Go's `len()` counts. A size charged in UTF-16 units instead agrees only
 * for ASCII, and the two SDKs enforce the document size limit client-side
 * against their own accounting, so they have to measure the same way.
 */
export function utf8Length(s: string): number {
  return textEncoder.encode(s).length;
}

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
 * `totalDataSize` calculates the total size of a resource.
 */
export function totalDataSize(d: DataSize): number {
  return d.data + d.meta;
}

/**
 * `addDataSizes` adds the size of a resource to the target resource.
 */
export function addDataSizes(
  target: DataSize,
  ...others: Array<DataSize>
): void {
  for (const other of others) {
    target.data += other.data;
    target.meta += other.meta;
  }
}

/**
 * `subDataSize` subtracts the size of a resource from the target resource.
 */
export function subDataSize(target: DataSize, other: DataSize): void {
  target.data -= other.data;
  target.meta -= other.meta;
}
