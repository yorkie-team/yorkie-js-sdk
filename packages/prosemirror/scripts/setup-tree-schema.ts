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
 * Server-side setup script for the tree schema ProseMirror example.
 *
 * Usage:
 *   npx ts-node scripts/setup-tree-schema.ts
 *
 * Environment variables:
 *   YORKIE_ADDR     - Yorkie server address (default: http://localhost:8080)
 *   YORKIE_ADMIN_USER - Admin username (default: admin)
 *   YORKIE_ADMIN_PASS - Admin password (default: admin)
 *   YORKIE_PROJECT    - Project name (default: default)
 */

const rpcAddr = process.env.YORKIE_ADDR || 'http://localhost:8080';
const adminUser = process.env.YORKIE_ADMIN_USER || 'admin';
const adminPass = process.env.YORKIE_ADMIN_PASS || 'admin';
const projectName = process.env.YORKIE_PROJECT || 'default';

const schemaName = 'pm-tree-schema';
const schemaVersion = 2;
const schemaKey = `${schemaName}@${schemaVersion}`;
const schemaBody = 'type Document = {tree: yorkie.Tree;};';
const treeNodeRules = [
  { node_type: 'doc', content: 'block+', marks: '', group: '' },
  {
    node_type: 'paragraph',
    content: '(text | span | strong | em | code)*',
    marks: '',
    group: 'block',
  },
  {
    node_type: 'heading',
    content: '(text | span | strong | em)*',
    marks: '',
    group: 'block',
  },
  { node_type: 'span', content: 'text*', marks: '', group: '' },
  {
    node_type: 'strong',
    content: '(text | em | code)*',
    marks: '',
    group: '',
  },
  { node_type: 'em', content: '(text | strong | code)*', marks: '', group: '' },
  { node_type: 'code', content: 'text*', marks: '', group: '' },
  { node_type: 'text', content: '', marks: '', group: '' },
];

/** Send a POST request to the Yorkie admin API. */
async function adminPost(path: string, body: object, authHeader?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authHeader) {
    headers['authorization'] = authHeader;
  }
  const res = await fetch(`${rpcAddr}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      msg = JSON.parse(text).message || text;
    } catch {
      // use raw text
    }
    throw new Error(msg);
  }
  return res.json();
}

/** Set up the tree schema on the Yorkie server. */
async function main() {
  console.log(`Setting up schema "${schemaKey}" on ${rpcAddr}...`);

  // 1. Login to get admin token
  const loginRes = await adminPost('yorkie.v1.AdminService/LogIn', {
    username: adminUser,
    password: adminPass,
  });
  const token = loginRes.token;
  console.log('Logged in as admin.');

  // 2. Get project's secret key
  const projRes = await adminPost(
    'yorkie.v1.AdminService/GetProject',
    { name: projectName },
    `Bearer ${token}`,
  );
  const secretKey = projRes.project.secretKey;
  console.log(`Got secret key for project "${projectName}".`);

  // 3. Create schema
  try {
    await adminPost(
      'yorkie.v1.AdminService/CreateSchema',
      {
        schema_name: schemaName,
        schema_version: schemaVersion,
        schema_body: schemaBody,
        rules: [
          {
            path: '$.tree',
            type: 'yorkie.Tree',
            tree_nodes: treeNodeRules,
          },
        ],
      },
      `API-Key ${secretKey}`,
    );
    console.log(`Schema "${schemaKey}" created successfully!`);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('already exists')) {
      console.log(`Schema "${schemaKey}" already exists.`);
    } else {
      throw e;
    }
  }
}

main().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
