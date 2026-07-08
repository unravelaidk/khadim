//! Tree-sitter parsing layer for Khadim: parse cache, node spans, checkable predicates.
//!
//! Public API:
//! - [`LanguageRegistry`] — file extension -> tree-sitter language mapping.
//! - [`ParseCache`] — per-file cached tree + source; [`ParseCache::parse`] and
//!   [`ParseCache::reparse`] (incremental when possible, full-reparse diff fallback).
//! - [`ChangedRange`] — byte range describing what changed between two parses.
//! - [`NodePath`] / [`NodeSpan`] — stable structural addressing into a syntax tree.
//! - [`Symbol`] / [`SymbolKind`] — extracted symbols with name, kind, signature, span.
//! - Predicate functions in [`predicates`]: [`predicates::parse_valid`],
//!   [`predicates::symbols`], [`predicates::function_exists`],
//!   [`predicates::has_signature`].

pub mod distance;
pub mod graph;
pub mod parser;
pub mod predicates;
pub mod span;

pub use distance::DistanceIndex;
pub use graph::{CodeGraph, EdgeKind, GraphEdge, GraphNode};
pub use parser::{ChangedRange, LangId, LanguageRegistry, ParseCache};
pub use predicates::{function_exists, has_signature, parse_valid, symbols, Symbol, SymbolKind};
pub use span::{span_at, NodePath, NodeSpan};