# Changelog

All notable changes to Yorkie JS SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and Yorkie JS SDK adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/yorkie-team/yorkie-js-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yorkie-team/yorkie-js-sdk/releases/tag/v0.1.0# 

