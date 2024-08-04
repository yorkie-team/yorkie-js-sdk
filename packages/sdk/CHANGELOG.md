# Changelog

All notable changes to Yorkie JS SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and Yorkie JS SDK adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.28] - 2024-07-25

### Added

- Improve performance for creating crdt.TreeNode by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/875
- Add Root-Only Filter Feature in History Tab by @gwbaik9717 in https://github.com/yorkie-team/yorkie-js-sdk/pull/872

### Changed

- Update example version to v0.4.27 by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/870
- Adjust Default LogLevel to Warn by @gwbaik9717 in https://github.com/yorkie-team/yorkie-js-sdk/pull/871

## [0.4.27] - 2024-07-11

### Changed

- Add taskQueue to handle each request one by one by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/862

### Removed

- Remove Custom JSDOM by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/864
- Remove vitest-environment-custom-jsdom from dependencies by @blurfx in https://github.com/yorkie-team/yorkie-js-sdk/pull/866
- Remove jsdom from dependencies by @blurfx in https://github.com/yorkie-team/yorkie-js-sdk/pull/867

### Fixed

- Handle retry for syncLoop and watchLoop by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/863
- Handle ErrClientNotActivated and ErrClientNotFound by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/865
- Handle local changes correctly when receiving snapshot by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/868

## [0.4.26] - 2024-07-04

### Changed

- Update example version to v0.4.25 by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/858

### Fixed

- Remove node from indexes during GC by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/860

## [0.4.25] - 2024-07-03

### Added

- Add `doc.subscribe('status', callback)` function by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/828

### Changed

- Use module import style for Protobuf by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/853
- Remove reattach test code by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/855

## [0.4.24] - 2024-06-14

### Added

- Show removed node in devtools by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/835

## [0.4.23] - 2024-06-07

### Changed

- Update examples version to v0.4.22 by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/845

### Fixed

- Fix miscalculation of tree size in concurrent editing by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/846

## [0.4.22] - 2024-06-04

### Added

- Add RHTNode removal to converter for consistency by @raararaara in https://github.com/yorkie-team/yorkie-js-sdk/pull/842

### Changed

- Update examples version to v0.4.21 by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/840
- Simplify type checking for style attributes in TreeStyleOpInfo by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/841

### Fixed

- Add conditional checks for `window` object by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/839

## [0.4.21] - 2024-06-03

### Changed

- Update example version to v0.4.20 by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/822
- Remove skip from style-style-test by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/829
- Include all nodes in tree.toJSInfoForTest by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/832
- Add ServerSeq into ChangeInfo by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/833

### Fixed

- Prevent remote-change events in RealtimeSyncOff mode by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/824
- Fix invalid error message in CRDTTreePos by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/830
- Fix incorrect tree snapshot encoding/decoding by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/836
- Fix incorrect indexes in TreeChange by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/837

## [0.4.20] - 2024-05-24

### Added

- Implement RHT.GC by @raararaara in https://github.com/yorkie-team/yorkie-js-sdk/pull/815

### Changed

- Update examples version to v0.4.19 by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/812
- Enhance type inference in Document.subscribe by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/814
- Apply GCPair to TreeNode, TextNode by @raararaara in https://github.com/yorkie-team/yorkie-js-sdk/pull/819

### Fixed

- Handle Tree.toXML to return proper XML string by @raararaara in https://github.com/yorkie-team/yorkie-js-sdk/pull/805
- Avoid unnecessary syncs in push-only syncmode by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/818

## [0.4.19] - 2024-05-10

### Added

- Add Tree concurrency tests by @justiceHui, @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/792

### Changed

- Update examples version to v0.4.18 by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/785
- Remove Client.subscribe by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/789
- Replace `benchmark.js` with `vitest bench` by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/793
- Replace webpack with vite by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/795
- Reset online clients when stream is disconnected by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/796
- Replace TSDoc with TypeDoc by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/800
- Add vite-plugin-dts to build yorkie-js-sdk.d.ts by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/801

### Fixed

- Export OpSource by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/786
- Add window type condition for using devtools by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/787
- Update GitHub Action workflow for create-yorkie-app by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/790
- Handle exception for the client without proper presence value in example by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/798
- Handle concurrent editing and styling in Tree by @raararaara in https://github.com/yorkie-team/yorkie-js-sdk/pull/803
- Fix invalid tree style changes by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/804
- Fix gc for multiple nodes in text and tree type by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/806

## [0.4.18] - 2024-04-23

### Added

- Add history tab and enhance visualization features to devtools by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/760

## [0.4.17] - 2024-04-19

### Added

- Add RealtimeSyncOff and refactor interface of SyncMode by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/772

### Fixed

- Fix issue of incorrect display of remote selection in Quill example by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/769
- Reverse TreeChanges when Deleting in Tree by @raararaara in https://github.com/yorkie-team/yorkie-js-sdk/pull/774
- Remove unnecessary stubs from the test code by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/776
- Provide CODECOV_TOKEN to codecov-action by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/777
- Fix issue of referencing process object on browser by @blurfx in https://github.com/yorkie-team/yorkie-js-sdk/pull/778

## [0.4.16] - 2024-03-29

### Added

- Implement Protocol Changes for Tree.RemoveStyle by @raararaara in https://github.com/yorkie-team/yorkie-js-sdk/pull/755

## [0.4.15] - 2024-03-11

### Added

- Implement Tree.RemoveStyle by @raararaara in https://github.com/yorkie-team/yorkie-js-sdk/pull/745

### Changed

- Change actorID to be non-optional by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/747

### Fixed

- Fix invalid sync when editing multiple cursors in CodeMirror6 by @devleejb in https://github.com/yorkie-team/yorkie-js-sdk/pull/743
- Fix incorrect index returned when using posRangeToIndexRange by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/742
- Fix incorrect calculation in `indexTree.treePosToPath` operation by @raararaara in https://github.com/yorkie-team/yorkie-js-sdk/pull/751
- Fix errors when editing Tree due to missing insPrevID in CRDTTree by @raararaara in https://github.com/yorkie-team/yorkie-js-sdk/pull/756
- Prevent remote-change events from occurring in push-only mode by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/759

## [0.4.14] - 2024-01-29

### Added

- Export LogLevel and setLogLevel @devleejb in https://github.com/yorkie-team/yorkie-js-sdk/pull/737
- Add design document for devtools extension by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/735

### Fixed

- Follow up work after devtools mvp by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/734
- Fix invalid TreeChanges in concurrent Tree.Style by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/738
- Restore interface changes due to server DB sharding by @sejongk https://github.com/yorkie-team/yorkie-js-sdk/pull/740

## [0.4.13] - 2024-01-19

### Added

- Implement devtools chrome extension by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/717

### Changed

- Reflect interface changes of server DB sharding by @sejongk in https://github.com/yorkie-team/yorkie-js-sdk/pull/726
- Complement concurrent editing test cases in Tree by @sejongk in https://github.com/yorkie-team/yorkie-js-sdk/pull/721
- Export devtools type by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/730
- Update examples version to v0.4.12 by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/722

### Fixed

- Fix multiple versions of prosemirror-model were loaded by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/728
- Fix invalid tree conversion by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/719

## [0.4.12] - 2024-01-05

### Added

- Add concurrent editing test cases in Tree by @sejongk in https://github.com/yorkie-team/yorkie-js-sdk/pull/710

### Fixed

- Generate correct TreeChange in concurrent edits by @sejongk in https://github.com/yorkie-team/yorkie-js-sdk/pull/712
- Add forced sync when switching to realtime mode by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/713
- Fix `getGarbageLen` to retrun correct size by @devleejb in https://github.com/yorkie-team/yorkie-js-sdk/pull/714
- Prevent deregisterElement from deregistering twice in nested object by @justiceHui in https://github.com/yorkie-team/yorkie-js-sdk/pull/716

## [0.4.11] - 2023-12-18

### Added

- Address duplicate node IDs in Tree.Split by @sejongk, @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/707
- Add test filtering and log printing guide to CONTRIBUTING.md by @sejongk in https://github.com/yorkie-team/yorkie-js-sdk/pull/708
- Support concurrent insertion and splitting in Tree by @sejongk in https://github.com/yorkie-team/yorkie-js-sdk/pull/709

### Changed

- Migrate RPC to ConnectRPC by @krapie, @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/698

## [0.4.10] - 2023-12-04

### Added

- Add create-yorkie-app by @se030, @blurfx in https://github.com/yorkie-team/yorkie-js-sdk/pull/690
- Implement splitLevel of Tree.Edit by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/704
- Add `removeIfNotAttached` to `client.detach()` options by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/703

### Fixed

- Fix reading wrong .env path by @blurfx in https://github.com/yorkie-team/yorkie-js-sdk/pull/694
- Handle escape string for strings containing quotes by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/700
- Correct typos in the installation command on README.md in the example by @ymw0407 in https://github.com/yorkie-team/yorkie-js-sdk/pull/702

## [0.4.9] - 2023-11-25

### Added

- Implement merge elements in `Tree.Edit` by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/681
- Add README and thumbnail on example 'simultaneous-cursors'by @banma1234 in https://github.com/yorkie-team/yorkie-js-sdk/pull/683
- Support Undo/Redo for object.set and object.remove operations by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/658

### Changed

- Refactor ProseMirror example and Tree codes by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/686
- Enhance Set and Add for representing nested elements by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/691

### Fixed

- Add missing `removedAt` during Primitive deepcopy by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/692
- Prevent empty ops are applied during undo/redo by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/687

## [0.4.8] - 2023-11-01

### Changed

- Replace karma with vitest by @blurfx, @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/665
- Remove vitest single thread config by @blurfx in https://github.com/yorkie-team/yorkie-js-sdk/pull/667
- Publish npm package with provenance by @jongwooo in https://github.com/yorkie-team/yorkie-js-sdk/pull/669
- Update examples version to v0.4.7 by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/671
- Update nextjs-scheduler to export static files by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/672
- Bump browserify-sign from 4.2.1 to 4.2.2 by @dependabot in https://github.com/yorkie-team/yorkie-js-sdk/pull/678
- Bump @babel/traverse from 7.22.11 to 7.23.2 by @dependabot in https://github.com/yorkie-team/yorkie-js-sdk/pull/670

### Removed

- Remove redundant types from tree by @JOOHOJANG in https://github.com/yorkie-team/yorkie-js-sdk/pull/666

### Fixed

- Fix missing collection of removed elements from the root by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/676
- Add more GC tests to reflect current server modifications by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/677
- Fit Next.js example style to the yorkie homepage by @blurfx in https://github.com/yorkie-team/yorkie-js-sdk/pull/675
- Disable jekyll on github actions by @blurfx in https://github.com/yorkie-team/yorkie-js-sdk/pull/674

## [0.4.7] - 2023-10-06

### Added

- Introduce basic architecture to support undo and redo by @hyemmie, @chacha912 and @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/650
- Add Text devtool to CodeMirror example by @chacha912 and @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/646
- Add DisableGC option to document by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/644
- Add toJS to return TreeNode of Tree by @JOOHOJANG and @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/639
- Add Tree.Edit benchmark and improve performance by @JOOHOJANG and @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/641
- Add simultaneous cursors example and Update examples to v0.4.6 by @YoonKiJin and @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/581
- Add nextjs-scheduler example by @banma1234 and @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/637

### Changed

- Improve tldraw example performance by @devleejb in https://github.com/yorkie-team/yorkie-js-sdk/pull/640
- Drop node 16 support by @blurfx in https://github.com/yorkie-team/yorkie-js-sdk/pull/653
- Strip internals from package d.ts files by @mojosoeun in https://github.com/yorkie-team/yorkie-js-sdk/pull/596
- Disable realtime sync in GC test (#656) by @sejongk and @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/656

### Removed

- Remove unused trie by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/651
- Remove SelectOpInfo by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/636

### Fixed

- Support concurrent formatting of Text by @MoonGyu1 in https://github.com/yorkie-team/yorkie-js-sdk/pull/642
- Recover istanbul-instrumenter-loader to use debugger by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/659
- Recover Select to prevent unsupported operation by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/634

## [0.4.6] - 2023-08-25

### Added

- Build error on node 18+ by @blurfx in https://github.com/yorkie-team/yorkie-js-sdk/pull/584
- Add .nvmrc to specify Node version to LTS by @kutta97 in https://github.com/yorkie-team/yorkie-js-sdk/pull/586
- Add client deactivation before unmount by @degurii in https://github.com/yorkie-team/yorkie-js-sdk/pull/595
- Add `presence.get()` to get presence value in doc.update() by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/600
- Add test for concurrent rich-text editing in the Peritext example by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/610
- Concurrent case handling for Yorkie.tree by @ehuas in https://github.com/yorkie-team/yorkie-js-sdk/pull/611
- Support multi-level and parital element selection by @sejongk in https://github.com/yorkie-team/yorkie-js-sdk/pull/631

### Changed

- Move "Building & Testing" Guide to CONTRIBUTING.md by @g2hhh2ee in https://github.com/yorkie-team/yorkie-js-sdk/pull/589
- Define more specific condition to check whether the input is opened by @su-ram in https://github.com/yorkie-team/yorkie-js-sdk/pull/597
- Clean up methods related to presence by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/599
- Refactor presence event code in examples by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/614
- Change TreeNode to have IDs instead of insPrev, insNext by @JOOHOJANG in https://github.com/yorkie-team/yorkie-js-sdk/pull/627
- Remove select operation from text by @blurfx in https://github.com/yorkie-team/yorkie-js-sdk/pull/622
- Fix invalid path of style changes by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/632

### Removed

### Fixed

- Fix `pathToTreePos` TC by @JOOHOJANG in https://github.com/yorkie-team/yorkie-js-sdk/pull/571
- Fix GC to remove all removed nodes by @JOOHOJANG in https://github.com/yorkie-team/yorkie-js-sdk/pull/568
- Expose pathToIndex API by @JOOHOJANG in https://github.com/yorkie-team/yorkie-js-sdk/pull/567
- Fix react-tldraw readme typo by @blurfx in https://github.com/yorkie-team/yorkie-js-sdk/pull/598
- Fix event-related tests to be deterministic by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/602
- Fix high and critical vulnerabilities by @mojosoeun in https://github.com/yorkie-team/yorkie-js-sdk/pull/630

## [0.4.5] - 2023-07-20

### Added

- Move Presence from Client to Document by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/574
- Tree edit update by @ehuas in https://github.com/yorkie-team/yorkie-js-sdk/pull/576

### Changed

- Replace selection with presence by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/578
- Bump word-wrap from 1.2.3 to 1.2.4 by @dependabot in https://github.com/yorkie-team/yorkie-js-sdk/pull/575
- Bump up protobuf by @JOOHOJANG in https://github.com/yorkie-team/yorkie-js-sdk/pull/570
- Prevent usage of `.` in JSONObject key by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/569

### Removed

- Remove duplicated test by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/564
- Remove InternalOpInfo by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/566

### Fixed

- Fix `pathToTreePos` TC by @JOOHOJANG in https://github.com/yorkie-team/yorkie-js-sdk/pull/571
- Fix GC to remove all removed nodes by @JOOHOJANG in https://github.com/yorkie-team/yorkie-js-sdk/pull/568
- Expose pathToIndex API by @JOOHOJANG in https://github.com/yorkie-team/yorkie-js-sdk/pull/567

## [0.4.4] - 2023-07-05

### Changed

- Cleanup of test-related terminology by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/562
- Use TreeRangeStruct to represent tree selection by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/561

## [0.4.3] - 2023-06-29

### Added

- Apply garbage collection to tree by @JOOHOJANG in https://github.com/yorkie-team/yorkie-js-sdk/pull/550

### Changed

- Cleanup TextChange by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/551

### Fixed

- Fix garbage collection bug by @JOOHOJANG in https://github.com/yorkie-team/yorkie-js-sdk/pull/555

## [0.4.2] - 2023-06-19

### Added

- Support for OperationInfo inference on Document.subscribe by @easylogic in https://github.com/yorkie-team/yorkie-js-sdk/pull/535
- Add peer selection display example by @easylogic in https://github.com/yorkie-team/yorkie-js-sdk/pull/544
- Implement Tree.Style and Tree.StyleByPath by @JOOHOJANG, @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/542

## [0.4.1] - 2023-06-09

### Changed

- Bump vite from 3.2.5 to 3.2.7 by @dependabot in https://github.com/yorkie-team/yorkie-js-sdk/pull/531
- change to next method as synchronously by @easylogic in https://github.com/yorkie-team/yorkie-js-sdk/pull/526
- Change the value of XXXChange to Change in Document.subscribe by @easylogic in https://github.com/yorkie-team/yorkie-js-sdk/pull/538
- Replace Tree.onChanges with Document.subscribe by @easylogic in https://github.com/yorkie-team/yorkie-js-sdk/pull/523

## [0.4.0] - 2023-06-05

### Added

- Implement yorkie.Tree for text editors using tree model by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/507

### Changed

- Bump socket.io-parser from 4.2.1 to 4.2.3 by @dependabot in https://github.com/yorkie-team/yorkie-js-sdk/pull/516
- Replace Text.onChanges with Document.subscribe by @easylogic in https://github.com/yorkie-team/yorkie-js-sdk/pull/519

## [0.3.5] - 2023-05-22

### Changed

- Bump yaml and husky by @dependabot in https://github.com/yorkie-team/yorkie-js-sdk/pull/505
- Apply Integration of SDK and Admin RPC Server by @krapie in https://github.com/yorkie-team/yorkie-js-sdk/pull/512

### Fixed

- Fix quill example page image rendering issue by @JOOHOJANG in https://github.com/yorkie-team/yorkie-js-sdk/pull/504
- Add actor to ChangeInfo / update api-reference by @JOOHOJANG in https://github.com/yorkie-team/yorkie-js-sdk/pull/508

## [0.3.4] - 2023-04-18

### Added

- Add the `document.subscribe(targetPath, (event) => {})`, which enables users to subscribe to a specific target in a document by @chacha912 in #487
- Add the `document.getValueByPath()` to get the value of a document by specifying the path by @chacha912 in #487
- Add benchmark tests for yorkie.Document by @JOOHOJANG in #494
- Add client sync mode, which enables users to pause and resume remote changes by @chacha912 in #495
- Add x-shard-key to APIs by @hackerwins in #486
- Add yorkie user agent in grpc metadata by @emplam27 in #488

### Changed

- Change Counter.increase() to remove the decimal part instead of using Math.floor() when a decimal number is passed as an argument by @JOOHOJANG in #496

### Fixed

- Return undefined when searching for presence of non-existent peer by @chacha912 in #493

## [0.3.3] - 2023-03-24

### Added

- Add optimization option in production mode by @easylogic in https://github.com/yorkie-team/yorkie-js-sdk/pull/474
- Add RemoveDocument API by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/480
- Add pause and resume to Client by @hackerwins in https://github.com/yorkie-team/yorkie-js-sdk/pull/482

### Changed

- Clarify the ClientEvent that is sent to client.subscribe by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/464
- Rename initialization to initialized in PeersChangedEvent by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/478

### Fixed

## [0.3.2] - 2023-02-27

### Fixed

- Fix ValueChange dependency by @krapie in https://github.com/yorkie-team/yorkie-js-sdk/pull/470

## [0.3.1] - 2023-02-27

### Added

- Add `delete` and `empty` method to `Text` data type by @cozitive in https://github.com/yorkie-team/yorkie-js-sdk/pull/454

### Changed

- Reduce bundle size for production by @easylogic in https://github.com/yorkie-team/yorkie-js-sdk/pull/460
- Remove string dependency of RGATreeSplit value by @cozitive in https://github.com/yorkie-team/yorkie-js-sdk/pull/459
- Remove priority queue from RHTPQMap and entire project by @blurfx in https://github.com/yorkie-team/yorkie-js-sdk/pull/462
- Modify config to run the webpack-bundle-analyzer when using `profile:bundle` script by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/468

### Fixed

- Fix invalid indexOf SplayTree with single node by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/463

## [0.3.0] - 2023-01-31

### Changed

- Merge Text and RichText by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/425
- Fix the value type of Counter and remove double type from Counter by @cozitive in https://github.com/yorkie-team/yorkie-js-sdk/pull/426
- Let Client.attach wait until stream initialization is finished by @cozitive in https://github.com/yorkie-team/yorkie-js-sdk/pull/440
- Add the toJS method to the ObjectProxy's handler by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/449

### Fixed

- Increase CRDT Counter in local change by @chacha912 in https://github.com/yorkie-team/yorkie-js-sdk/pull/441

## [0.2.20] - 2022-12-30

### Added

- Add benchmark tests by @parkeunae in #358, #359
- Add CodeMirror6 integration example by @blurfx in #394
- Add vuejs-kanban example by @hackerwins in #399
- Add profile-stack example by @chacha912 #414

### Changed

- Bump socket.io-parser from 4.0.4 to 4.0.5 by @dependabot in #403
- Bump engine.io and socket.io by @dependabot in #407
- Bump express from 4.17.1 to 4.18.2 by @dependabot in #411
- Bump minimatch from 3.0.4 to 3.1.2 by @dependabot in #412

### Fixed

- Fix issues identified during iOS SDK development by @hackerwins in #398
- Use uint64 for date value by @hackerwins in #408

## [0.2.19] - 2022-10-04

### Changed

- Rename keyOf to subPathOf: #391

### Fixed

- Remove unused nodeMapByCreatedAt in RHT: #386
- Change lamport from uint64 to int64: #390

## [0.2.16] - 2022-08-16

### Changed

- Apply generics to support any types of properties in RichText: #354

### Fixed

- Send peers-changed event to the user who updated one's own presence: #371
- Fix the error that occurs when importing JS SDK in Next.js: #378

## [0.2.15] - 2022-08-08

### Added

- Add snapshot event observer to Quill example: #365

### Changed

- Bump up proto files to the latest: #367
- Export Change APIs to generate history snapshots in admin: #368
- Change trie traverse parameter name to isTerminalIncluded: #363

## [0.2.14] - 2022-08-03

### Added

- Reduce the number of paths of change events: #351

### Fixed

- Fix the problem local changes were applied twice: #356
- Update CodeMirror example to handle snapshot events: #360

## [0.2.13] - 2022-07-27

### Added

- Support Quill embeds type to example project: #344

### Fixed

- Fix a bug when overwriting in Object: #349

## [0.2.12] - 2022-07-20

### Fixed

- Fix incorrect index for nodes newly created then concurrently removed: #334
- Fix initial value bug in counter proxy: #333

## [0.2.11] - 2022-07-14

### Fixed

- Escape string to return valid json: #330

## [0.2.10] - 2022-07-06

### Added

- Implement array methods with objects: #327

### Changed

- Improve performance deletion in Text: #326

### Fixed

- Fix a bug when deleting blocks concurrently: #328

## [0.2.9] - 2022-06-30

### Changed

- Implement inserting elements with splice() method: #318

### Fixed

- Revert text deletion improvements: #323

## [0.2.8] - 2022-06-22

### Added

- Add read-only Array methods to ArrayProxy: #310
- Add Array.splice to ArrayProxy: #317

### Changed

- Use types more strictly in Document.update: #314
- Revert Document and Text: #47478e7
- Improve performance deletion in Text: #312, #316

### Fixed

- Remove size cache from RGATreeList and use SplayTree instead: #315
- Fix bug when setting non-string values in Presence: #311

## [0.2.7] - 2022-05-25

### Fixed

- Expose constructors for user-accessible types

## [0.2.6] - 2022-05-25

### Changed

- Refine SDK interface: #300

## [0.2.5] - 2022-05-12

### Added

- Add apiKey option: #295

## [0.2.4] - 2022-05-10

### Changed

- Fix incorrect type hint in document.update handler: #289
- Rename Client Metadata to Presence: #293

### Removed

- Remove collection from document: #292

## [0.2.3] - 2022-04-07

### Changed

- Bump up yorkie.proto to 0.2.3

## [0.2.0] - 2021-12-19

2nd Year Release

### Added

- Garbage collection for Text and RichText
- Improve Client's metadata to be updatable
- Improved Peer Awareness
- Supporting TLS and Auth webhook

### Changed

### Removed

### Deprecated

## [0.1.11] - 2021-12-04

### Fixed

- Fix a bug where text nodes with tombstones were not counted: #263

## [0.1.10] - 2021-11-16

### Added

- Add Array.toJS() and Object.toJS(): #237

### Changed

- Print log message more accurately: #5ce95c6, #de05448

### Fixed

- Fix quill example page: #260

## [0.1.8] - 2021-10-21

### Fixed

- Hide clock from value of peers-changed event

## [0.1.7] - 2021-10-19

### Added

- Improve Client's metadata to be updatable: #240

### Fixed

- Fix reduce array size when deleting the same position: #229
- Handle special characters in keys of the path in change events: #247

## [0.1.6] - 2021-07-24

### Added

- Add client.getStatus and client.Metadata: #162f2d5

### Changed

- Change getElementByID to return undefined if the element doesnt exist: #208
- Change esnext to ES2019 in compiler target option: #197
- Clean up JS SDK Reference: #181, #218, #219

### Fixed

- Fix a bug where deleted values from objects are revivded after GC: #216

## [0.1.5] - 2021-06-05

### Added

- Add moveFront, moveAfter, moveLast, insertBefore to Array: #194, #203, #206, #207
- Add AuthInterceptor: #199

### Fixed

- Fix the concurrent editing issue of Move Operation: #196
- Fix a bug when pushing an array element in Array: #200

### Removed

- Delete RequestHeader in Protobuf

## [0.1.4] - 2021-05-15

### Added

### Changed

- Rename Document.getKey().toIDString() to Document.getKey(): #178
- Only display exported objects in JS SDK Reference: #179
- Rename Document to DocumentReplica: #10f2b72

### Fixed

- Fix a bug occurs when setting an empty string as a key: #182
- Fix a bug that the first element of an array was not deleted: #185
- Fix a bug that the size of the array increases when moving element: #186
- Fix a bug that did not move after pushing in same update: #188

## [0.1.3] - 2021-04-04

### Added

- Pass paths to change events: #162
- Support null and undefined values: #157
- Add type parameter to Document: #148

### Changed

- Rename getRootObject to getRoot: #158
- Rename updateSelection to select: #170

### Fixed

- Fix error that occurred when deleting value using missing key or index: #149
- Fix invalid states of SplayTree: #153
- Remove errors that occur when insPrev does not exist: #166

## [0.1.2] - 2021-02-14

### Added

- Add customizable metadata for peer awareness: #123
- Add garbage collection for Text and RichText: #137

### Changed

- Replace the type of client_id to a byte array to reduce payload: #133

### Fixed

- Fix a bug that attributes were lost when splitting RichText nodes: #136

## [0.1.1] - 2021-01-01

### Added

- Add garbage collect for Container type: #101

### Changed

- Update libs to fix security vulnerability: #103

### Fixed

- Fix quill paragraph style errors: #104
- Change Logger to receive all values: #100

## [0.1.0] - 2020-11-07

First public release

### Added

- Add `Client` and `Document`
- Add Custom CRDT data type `Text` for code editor
- Add Custom CRDT data type `RichText` for WYSIWYG editor
- Add examples: CodeMirror, Drawing, Quill
- Support Network Auto Recovery
- Add Peer Awareness
- Add Custom CRDT data type `Counter`

### Changed

### Removed

### Deprecated

[unreleased]: https://github.com/yorkie-team/yorkie-js-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yorkie-team/yorkie-js-sdk/releases/tag/v0.1.0#
