# Changelog

All notable changes to Yorkie JS SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and Yorkie JS SDK adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

