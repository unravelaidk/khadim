//! Skill discovery, state, and prompt injection.
//!
//! Skills are markdown files that provide specialized instructions to the
//! agent.  Each skill lives in its own directory with a `SKILL.md` entry
//! point.  The user can configure multiple scan directories (default:
//! `~/.agents/skills`) and toggle individual skills on/off.

pub mod scanner;

pub use scanner::{SkillEntry, SkillManager};
