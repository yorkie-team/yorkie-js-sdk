/*
 * Copyright 2025 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * `RevisionSummary` represents a document revision for version management.
 * It stores a snapshot of document content at a specific point in time,
 * enabling features like rollback, audit, and version history tracking.
 */
export interface RevisionSummary {
  /**
   * `id` is the unique identifier of the revision.
   */
  id: string;

  /**
   * `label` is a user-friendly name for this revision.
   */
  label: string;

  /**
   * `description` is a detailed explanation of this revision.
   */
  description: string;

  /**
   * `snapshot` is the serialized document content (JSON format) at this revision point.
   * This contains only the pure data without CRDT metadata.
   */
  snapshot: string;

  /**
   * `createdAt` is the time when this revision was created.
   */
  createdAt: Date;
}
