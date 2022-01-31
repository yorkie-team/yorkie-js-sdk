/*
 * Copyright 2021 The Yorkie Authors. All rights reserved.
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
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

/**
 * This script do following things
 * 1. generate front matter for all documents
 * 2. remove home link from all documents
 * 3. remove .md extension from path inside each document
 */
async function generateFrontmatter() {
  const docsDirPath = path.join(__dirname, '../docs');
  const files = fs.readdirSync(docsDirPath);

  console.log('Generating front matter...');

  for (const file of files) {
    const filePath = path.join(docsDirPath, file);
    let header: string[] = [];
    const { name } = path.parse(filePath);
    const input = fs.createReadStream(filePath);
    const output: string[] = [];
    const lines = readline.createInterface({
      input,
      crlfDelay: Infinity,
    });

    lines.on('line', (line) => {
      let skip = false;

      // remove .md extension
      if (line.match(/.md/)) {
        line = line.replace(/.md/g, '');
      }

      // remove home link from all documents
      const homeLink = line.match(/\[Home\]\(.\/index\) &gt; (.*)/);
      if (homeLink) {
        if (name !== 'yorkie-js-sdk') {
          output.push(homeLink[1]);
        }
        skip = true;
      }
      if (!skip) {
        output.push(line);
      }

      lines.close();
    });
    await new Promise((resolve) => lines.once('close', resolve));
    input.close();

    // generate front matter for each document
    if (!output[0].startsWith('---')) {
      if (name === 'yorkie-js-sdk') {
        header = [
          '---',
          `title: JS Reference`,
          `hide: false`,
          `layout: docs`,
          `group: js-references`,
          `category: JS SDK`,
          `permalink: /docs/js-references/yorkie-js-sdk`,
          `order: 31`,
          '---',
        ];
      } else {
        header = [
          '---',
          `hide: true`,
          `layout: docs`,
          `group: js-references`,
          '---',
        ];
      }
    }
    const newOutput = header.concat(output).join('\n');
    fs.writeFileSync(filePath, newOutput);
  }
  console.log('Done');
}

generateFrontmatter();
