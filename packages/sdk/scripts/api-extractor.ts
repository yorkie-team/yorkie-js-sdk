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
import * as path from 'path';
import * as fs from 'fs';
import {
  Extractor,
  ExtractorConfig,
  ExtractorResult,
} from '@microsoft/api-extractor';

const prunedDTSFilePath = path.join(__dirname, '../dist/yorkie-js-sdk.d.ts');

const globalApiExtractorJsonPath: string = path.join(
  __dirname,
  '../config/api-extractor.json',
);

const overridesPath = path.resolve(globalApiExtractorJsonPath);

// Read current api-extractor.json file
const apiExtractorJsonFile = fs.readFileSync(overridesPath);
const apiExtractorJsonOverrides = fs.existsSync(overridesPath)
  ? JSON.parse(apiExtractorJsonFile.toString())
  : {};

// Create a new `api-extractor.json` file in the `lib` folder for generating documents
const apiExtractorJson = {
  ...apiExtractorJsonOverrides,
  $schema:
    'https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json',

  mainEntryPointFilePath: prunedDTSFilePath,

  docModel: {
    enabled: true,
  },

  dtsRollup: {
    enabled: false,
  },
};
const apiExtractorJsonPath: string = path.join(
  __dirname,
  '../lib/api-extractor.json',
);
fs.writeFileSync(apiExtractorJsonPath, JSON.stringify(apiExtractorJson));

// Load and parse the api-extractor.json file
const extractorConfig: ExtractorConfig =
  ExtractorConfig.loadFileAndPrepare(apiExtractorJsonPath);

// Invoke API Extractor
const extractorResult: ExtractorResult = Extractor.invoke(extractorConfig, {
  // Equivalent to the "--local" command-line parameter
  localBuild: true,

  // Equivalent to the "--verbose" command-line parameter
  showVerboseMessages: true,
});

if (extractorResult.succeeded) {
  console.log(`API Extractor completed successfully`);
  process.exitCode = 0;
} else {
  console.error(
    `API Extractor completed with ${extractorResult.errorCount} errors` +
      +` and ${extractorResult.warningCount} warnings`,
  );
  process.exitCode = 1;
}
