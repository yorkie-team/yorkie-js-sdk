# Changelog

All notable changes to Yorkie JS SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and Yorkie JS SDK adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

