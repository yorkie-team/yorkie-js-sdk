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
  '../api-extractor.json',
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
