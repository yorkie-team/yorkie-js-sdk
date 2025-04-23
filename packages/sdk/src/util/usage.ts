/**
 * `UsageTotal` represents the total usage of a resource.
 */
export type UsageTotal = {
  live: Usage;
  gc: Usage;
};

/**
 * `Usage` represents the usage of a resource.
 */
export type Usage = {
  content: number;
  meta: number;
};
