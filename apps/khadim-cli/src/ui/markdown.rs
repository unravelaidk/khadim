//! Markdown rendering for the transcript.
//!
//! Architecture: event-driven `Writer` over `pulldown-cmark`, with an
//! indent stack carrying a per-context `is_list` flag so continuation
//! lines only inherit the *deepest* list's prefix. `marker` and
//! `prefix` spans are kept separate — the marker only appears on the
//! first line of an item; wrapped continuations align under the item
//! text. Per-line flush re-wraps with `textwrap` while preserving span
//! styles, and explicit `needs_newline` / `pending_marker_line`
//! bookkeeping handles blank-line correctness across blocks.
//!
//! Khadim adds:
//!   * GFM tables  (delegated to `ui::table`)
//!   * GFM task list checkboxes
//!   * GFM blockquote alerts  (NOTE / TIP / IMPORTANT / WARNING / CAUTION)
//!   * Theme-driven colors via `ui::theme::md_*`
//!
//! Style rules: bold + underline for H1, bold for H2, bold + italic for
//! H3, italic for H4-H6. *Colors* come from the active khadim theme so
//! the renderer participates in `/theme` switching.

use pulldown_cmark::{
    Alignment, BlockQuoteKind, CodeBlockKind, CowStr, Event, HeadingLevel, Options, Parser, Tag,
    TagEnd,
};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span, Text};
use textwrap::{Options as WrapOptions, WordSplitter};
use unicode_width::UnicodeWidthStr;

use super::highlight::{highlight_code_block, normalize_lang};
use super::theme::{
    md_blockquote, md_bq_caution, md_bq_important, md_bq_note, md_bq_tip, md_bq_warning,
    md_code_bg, md_code_fg, md_heading, md_hr, md_image, md_link, md_list_bullet, md_strikethrough,
    md_task_checked, md_task_unchecked,
};

// ── Public entry point ───────────────────────────────────────────────

/// Render `md` into transcript lines, soft-wrapped at `width` columns.
///
/// `width` is the total column budget the caller has — a 2-column gutter
/// is reserved internally so output never sits flush against the edge.
pub fn render_markdown(md: &str, width: usize) -> Vec<Line<'static>> {
    const GUTTER: usize = 2;
    let wrap_width = width.saturating_sub(GUTTER).max(10);
    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_GFM);
    options.insert(Options::ENABLE_SMART_PUNCTUATION);
    let parser = Parser::new_ext(md, options);

    let mut writer = Writer::new(parser, wrap_width);
    writer.run();
    writer.finish()
}

// ── Style palette (theme-aware) ──────────────────────────────────────

#[derive(Clone)]
struct Styles {
    h1: Style,
    h2: Style,
    h3: Style,
    h4: Style,
    h5: Style,
    h6: Style,
    code: Style,
    code_block: Style,
    emphasis: Style,
    strong: Style,
    strikethrough: Style,
    ordered_marker: Style,
    unordered_marker: Style,
    link: Style,
    blockquote: Style,
    image: Style,
    hr: Style,
    task_done: Style,
    task_pending: Style,
}

impl Styles {
    fn from_theme() -> Self {
        let head = Style::default().fg(md_heading());
        Self {
            h1: head.bold().underlined(),
            h2: head.bold(),
            h3: head.bold().italic(),
            h4: head.italic(),
            h5: head.italic(),
            h6: head.italic(),
            code: Style::default().fg(md_code_fg()),
            // Fenced code blocks pick up a subtle background as well —
            // distinguishes them from inline code without needing a frame.
            code_block: Style::default().fg(md_code_fg()).bg(md_code_bg()),
            emphasis: Style::default().italic(),
            strong: Style::default().bold(),
            strikethrough: Style::default()
                .fg(md_strikethrough())
                .add_modifier(Modifier::CROSSED_OUT),
            ordered_marker: Style::default().fg(md_list_bullet()),
            unordered_marker: Style::default().fg(md_list_bullet()),
            link: Style::default().fg(md_link()).underlined(),
            blockquote: Style::default().fg(md_blockquote()),
            image: Style::default().fg(md_image()).add_modifier(Modifier::DIM),
            hr: Style::default().fg(md_hr()).add_modifier(Modifier::DIM),
            task_done: Style::default().fg(md_task_checked()).bold(),
            task_pending: Style::default().fg(md_task_unchecked()),
        }
    }

    const fn heading(&self, level: HeadingLevel) -> Style {
        match level {
            HeadingLevel::H1 => self.h1,
            HeadingLevel::H2 => self.h2,
            HeadingLevel::H3 => self.h3,
            HeadingLevel::H4 => self.h4,
            HeadingLevel::H5 => self.h5,
            HeadingLevel::H6 => self.h6,
        }
    }

    fn alert(&self, kind: BlockQuoteKind) -> Style {
        let fg = match kind {
            BlockQuoteKind::Note => md_bq_note(),
            BlockQuoteKind::Tip => md_bq_tip(),
            BlockQuoteKind::Important => md_bq_important(),
            BlockQuoteKind::Warning => md_bq_warning(),
            BlockQuoteKind::Caution => md_bq_caution(),
        };
        Style::default().fg(fg).bold()
    }
}

const fn alert_label(kind: BlockQuoteKind) -> &'static str {
    match kind {
        BlockQuoteKind::Note => "NOTE ",
        BlockQuoteKind::Tip => "TIP ",
        BlockQuoteKind::Important => "IMPORTANT ",
        BlockQuoteKind::Warning => "WARNING ",
        BlockQuoteKind::Caution => "CAUTION ",
    }
}

// ── Indent stack ─────────────────────────────────────────────────────

/// One frame in the indent stack.
///
/// `prefix` is rendered on every line. `marker` (when present) is
/// substituted *in place of* `prefix` on the first line of a list item
/// — that is what aligns continuation lines under the item text rather
/// than under the marker.
///
/// `is_list` is the key piece for nested-list correctness: when emitting
/// a continuation line, only the *deepest* list frame contributes its
/// prefix, so item content never gets double- or triple-indented as the
/// list nesting grows.
#[derive(Clone)]
struct IndentCtx {
    prefix: Vec<Span<'static>>,
    marker: Option<Vec<Span<'static>>>,
    is_list: bool,
}

impl IndentCtx {
    const fn new(
        prefix: Vec<Span<'static>>,
        marker: Option<Vec<Span<'static>>>,
        is_list: bool,
    ) -> Self {
        Self {
            prefix,
            marker,
            is_list,
        }
    }
}

// ── Writer state ─────────────────────────────────────────────────────

struct CodeBlock {
    lang: String,
    buffer: String,
}

struct Table {
    alignments: Vec<Alignment>,
    rows: Vec<Vec<String>>,
    in_cell: bool,
    cell_buf: String,
    current_row: Vec<String>,
}

struct LinkState {
    url: String,
    label_start: usize,
}

struct Writer<'a, I>
where
    I: Iterator<Item = Event<'a>>,
{
    iter: I,
    out: Vec<Line<'static>>,
    styles: Styles,
    /// Inline style stack — top is the merged style for the next text.
    inline: Vec<Style>,
    indents: Vec<IndentCtx>,
    /// `Some(n)` for ordered lists (n is the next number to emit),
    /// `None` for bullet lists.
    list_indices: Vec<Option<u64>>,
    code_block: Option<CodeBlock>,
    table: Option<Table>,
    link: Option<LinkState>,
    /// GFM alert label that should prefix the next paragraph in a quote.
    pending_alert: Option<BlockQuoteKind>,
    /// Outstanding task-marker `[x]` / `[ ]` to inject at item start.
    task_marker: Option<bool>,
    /// True when a blank separator is owed before the next block.
    needs_newline: bool,
    /// True between `Tag::Item` and the first content event in the item:
    /// triggers marker emission on the first line that gets pushed.
    pending_marker_line: bool,
    /// In-progress line being assembled; flushed on every line break,
    /// block boundary, and end-of-input.
    current: Option<Line<'static>>,
    /// Indent spans to prepend when `current` is flushed (first / wrap).
    current_initial: Vec<Span<'static>>,
    current_subsequent: Vec<Span<'static>>,
    /// Whether `current` came from a code block — disables wrapping.
    current_in_code: bool,
    /// Per-line inherited style (used to color blockquote bodies green).
    current_style: Style,
    wrap_width: usize,
    in_paragraph: bool,
}

impl<'a, I> Writer<'a, I>
where
    I: Iterator<Item = Event<'a>>,
{
    fn new(iter: I, wrap_width: usize) -> Self {
        Self {
            iter,
            out: Vec::new(),
            styles: Styles::from_theme(),
            inline: Vec::new(),
            indents: Vec::new(),
            list_indices: Vec::new(),
            code_block: None,
            table: None,
            link: None,
            pending_alert: None,
            task_marker: None,
            needs_newline: false,
            pending_marker_line: false,
            current: None,
            current_initial: Vec::new(),
            current_subsequent: Vec::new(),
            current_in_code: false,
            current_style: Style::default(),
            wrap_width,
            in_paragraph: false,
        }
    }

    fn run(&mut self) {
        while let Some(ev) = self.iter.next() {
            self.handle(ev);
        }
        self.flush_current_line();
    }

    // ── Event dispatch ────────────────────────────────────────────────

    fn handle(&mut self, event: Event<'a>) {
        match event {
            Event::Start(tag) => self.start(tag),
            Event::End(tag) => self.end(tag),
            Event::Text(t) => self.text(t),
            Event::Code(c) => self.code_inline(c),
            Event::Html(h) => self.html(h, /*inline*/ false),
            Event::InlineHtml(h) => self.html(h, /*inline*/ true),
            Event::SoftBreak => self.push_span(Span::raw(" ")),
            Event::HardBreak => self.hard_break(),
            Event::Rule => self.horizontal_rule(),
            Event::TaskListMarker(checked) => self.set_task_marker(checked),
            Event::FootnoteReference(_) => {}
            Event::InlineMath(m) => self.push_span(Span::styled(
                format!("${m}$"),
                self.current_inline_style().patch(self.styles.code),
            )),
            Event::DisplayMath(m) => self.push_span(Span::styled(
                format!("$${m}$$"),
                self.current_inline_style().patch(self.styles.code),
            )),
        }
    }

    /// pulldown emits `Item` *before* `TaskListMarker`, so the bullet/
    /// number marker has already been pushed onto `indents` by the time
    /// the task marker arrives. Retroactively swap the top frame's
    /// marker for the checkbox form.
    fn set_task_marker(&mut self, checked: bool) {
        self.task_marker = Some(checked);
        let depth = self.list_indices.len();
        let width = depth.saturating_mul(4).saturating_sub(3).max(1);
        let lead = " ".repeat(width.saturating_sub(1));
        let marker = if checked {
            vec![
                Span::raw(format!("{lead}[")),
                Span::styled("x", self.styles.task_done),
                Span::raw("] "),
            ]
        } else {
            vec![Span::styled(
                format!("{lead}[ ] "),
                self.styles.task_pending,
            )]
        };
        if let Some(top) = self.indents.last_mut() {
            if top.is_list {
                top.marker = Some(marker);
            }
        }
    }

    fn start(&mut self, tag: Tag<'a>) {
        match tag {
            Tag::Paragraph => self.start_paragraph(),
            Tag::Heading { level, .. } => self.start_heading(level),
            Tag::BlockQuote(kind) => self.start_blockquote(kind),
            Tag::CodeBlock(kind) => {
                let lang = match kind {
                    CodeBlockKind::Fenced(l) => l.to_string(),
                    CodeBlockKind::Indented => String::new(),
                };
                self.start_code_block(lang);
            }
            Tag::List(start) => self.start_list(start),
            Tag::Item => self.start_item(),
            Tag::Emphasis => self.push_inline(self.styles.emphasis),
            Tag::Strong => self.push_inline(self.styles.strong),
            Tag::Strikethrough => self.push_inline(self.styles.strikethrough),
            Tag::Link { dest_url, .. } => self.start_link(dest_url),
            Tag::Image {
                dest_url, title, ..
            } => self.image(dest_url, title),
            Tag::Table(alignments) => self.start_table(alignments),
            Tag::TableHead | Tag::TableRow => {
                if let Some(t) = &mut self.table {
                    t.current_row.clear();
                }
            }
            Tag::TableCell => {
                if let Some(t) = &mut self.table {
                    t.in_cell = true;
                    t.cell_buf.clear();
                }
            }
            Tag::HtmlBlock | Tag::FootnoteDefinition(_) | Tag::MetadataBlock(_) => {}
            Tag::DefinitionList
            | Tag::DefinitionListTitle
            | Tag::DefinitionListDefinition
            | Tag::Subscript
            | Tag::Superscript => {}
        }
    }

    fn end(&mut self, tag: TagEnd) {
        match tag {
            TagEnd::Paragraph => self.end_paragraph(),
            TagEnd::Heading(_) => self.end_heading(),
            TagEnd::BlockQuote(_) => self.end_blockquote(),
            TagEnd::CodeBlock => self.end_code_block(),
            TagEnd::List(_) => self.end_list(),
            TagEnd::Item => {
                self.indents.pop();
                self.pending_marker_line = false;
            }
            TagEnd::Emphasis | TagEnd::Strong | TagEnd::Strikethrough => self.pop_inline(),
            TagEnd::Link => self.end_link(),
            TagEnd::Image => {}
            TagEnd::Table => self.end_table(),
            TagEnd::TableHead | TagEnd::TableRow => {
                if let Some(t) = &mut self.table {
                    let row = std::mem::take(&mut t.current_row);
                    t.rows.push(row);
                }
            }
            TagEnd::TableCell => {
                if let Some(t) = &mut self.table {
                    t.in_cell = false;
                    let cell = t.cell_buf.trim().to_string();
                    t.current_row.push(cell);
                    t.cell_buf.clear();
                }
            }
            TagEnd::HtmlBlock | TagEnd::FootnoteDefinition | TagEnd::MetadataBlock(_) => {}
            TagEnd::DefinitionList
            | TagEnd::DefinitionListTitle
            | TagEnd::DefinitionListDefinition
            | TagEnd::Subscript
            | TagEnd::Superscript => {}
        }
    }

    // ── Block starts / ends ───────────────────────────────────────────

    fn start_paragraph(&mut self) {
        if self.needs_newline {
            self.push_blank_line();
        }
        self.push_line(Line::default());
        self.needs_newline = false;
        self.in_paragraph = true;

        // Inject GFM alert label as the first thing on the paragraph line.
        if let Some(kind) = self.pending_alert.take() {
            let span = Span::styled(alert_label(kind), self.styles.alert(kind));
            self.push_span(span);
        }
    }

    const fn end_paragraph(&mut self) {
        self.needs_newline = true;
        self.in_paragraph = false;
        self.pending_marker_line = false;
    }

    fn start_heading(&mut self, level: HeadingLevel) {
        if self.needs_newline {
            self.push_blank_line();
            self.needs_newline = false;
        }
        let style = self.styles.heading(level);
        let hashes = "#".repeat(level as usize);
        self.push_line(Line::from(vec![Span::styled(format!("{hashes} "), style)]));
        self.push_inline(style);
        self.needs_newline = false;
    }

    fn end_heading(&mut self) {
        self.needs_newline = true;
        self.pop_inline();
    }

    fn start_blockquote(&mut self, kind: Option<BlockQuoteKind>) {
        if self.needs_newline {
            self.push_blank_line();
            self.needs_newline = false;
        }
        if let Some(k) = kind {
            self.pending_alert = Some(k);
        }
        self.indents.push(IndentCtx::new(
            vec![Span::styled("▌ ", self.styles.blockquote)],
            /*marker*/ None,
            /*is_list*/ false,
        ));
    }

    fn end_blockquote(&mut self) {
        self.indents.pop();
        self.needs_newline = true;
    }

    fn start_code_block(&mut self, lang: String) {
        self.flush_current_line();
        if !self.out.is_empty() {
            self.push_blank_line();
        }
        self.code_block = Some(CodeBlock {
            lang,
            buffer: String::new(),
        });
        // Push an indent frame so blocks nested in lists/quotes get the
        // right left margin; the code itself is emitted in `end_code_block`.
        self.indents.push(IndentCtx::new(
            Vec::new(),
            /*marker*/ None,
            /*is_list*/ false,
        ));
        self.needs_newline = true;
    }

    fn end_code_block(&mut self) {
        if let Some(block) = self.code_block.take() {
            // Optional dim language label.
            let lang = block
                .lang
                .split([',', ' ', '\t'])
                .next()
                .unwrap_or("")
                .trim();
            let normalized = normalize_lang(lang);
            if !lang.is_empty() {
                let mut line = Line::default();
                line.push_span(Span::styled(
                    lang.to_string(),
                    Style::default().add_modifier(Modifier::DIM),
                ));
                self.push_line(line);
            }

            // Try syntax highlighting; fall back to plain theme-colored text.
            let highlighted = (!lang.is_empty())
                .then(|| highlight_code_block(normalized, &block.buffer))
                .flatten();

            if let Some(lines) = highlighted {
                for (_line_no, spans) in lines {
                    let mut line = Line::default();
                    // Re-apply the code-block background to every span so the
                    // whole line has a uniform background even where syntax
                    // tokens don't reach.
                    for span in spans {
                        let style = span.style.patch(self.styles.code_block);
                        line.push_span(Span::styled(span.content.to_string(), style));
                    }
                    self.push_code_line(line);
                }
            } else {
                // Emit code lines verbatim — no wrapping, preserve whitespace.
                for raw in block.buffer.lines() {
                    let mut line = Line::default();
                    line.push_span(Span::styled(raw.to_string(), self.styles.code_block));
                    self.push_code_line(line);
                }
            }
        }
        self.indents.pop();
        self.needs_newline = true;
    }

    fn start_list(&mut self, index: Option<u64>) {
        if self.list_indices.is_empty() && self.needs_newline {
            self.push_line(Line::default());
        }
        self.list_indices.push(index);
    }

    fn end_list(&mut self) {
        self.list_indices.pop();
        if self.list_indices.is_empty() {
            self.needs_newline = true;
        }
    }

    /// Build the per-item indent frame.
    ///
    /// Indent formula: `width = depth*4 - 3` is the column budget for
    /// the marker; the continuation `prefix` is `width + 2` cols for
    /// ordered lists (room for ` N. `) and `width + 1` for bullets.
    /// This gives 4-space indentation per nesting level with correctly
    /// aligned numerals up to 99.
    fn start_item(&mut self) {
        // Flush any in-progress line first — in tight lists pulldown emits
        // raw `Text` events with no wrapping `Tag::Paragraph`, so without
        // this the next item's text would get appended to the previous
        // item's `current` line.
        self.flush_current_line();
        self.pending_marker_line = true;
        let depth = self.list_indices.len();
        let width = depth.saturating_mul(4).saturating_sub(3).max(1);

        let is_ordered = self.list_indices.last().copied().flatten().is_some();

        // Override marker if a task-list marker is pending.
        let marker_spans = if let Some(checked) = self.task_marker.take() {
            let lead = " ".repeat(width.saturating_sub(1));
            if checked {
                vec![
                    Span::raw(format!("{lead}[")),
                    Span::styled("x", self.styles.task_done),
                    Span::raw("] "),
                ]
            } else {
                vec![Span::styled(
                    format!("{lead}[ ] "),
                    self.styles.task_pending,
                )]
            }
        } else if let Some(Some(n)) = self.list_indices.last_mut() {
            let s = format!("{:width$}. ", *n, width = width);
            *n += 1;
            vec![Span::styled(s, self.styles.ordered_marker)]
        } else {
            let lead = " ".repeat(width.saturating_sub(1));
            vec![Span::styled(
                format!("{lead}• "),
                self.styles.unordered_marker,
            )]
        };

        let indent_len = if is_ordered { width + 2 } else { width + 1 };
        let prefix = vec![Span::raw(" ".repeat(indent_len))];

        self.indents.push(IndentCtx::new(
            prefix,
            Some(marker_spans),
            /*is_list*/ true,
        ));
        self.needs_newline = false;
    }

    // ── Inline ────────────────────────────────────────────────────────

    fn text(&mut self, t: CowStr<'a>) {
        // Buffer raw code-block content for verbatim emission later.
        if let Some(block) = &mut self.code_block {
            block.buffer.push_str(&t);
            return;
        }
        if let Some(tbl) = &mut self.table {
            if tbl.in_cell {
                tbl.cell_buf.push_str(&t);
                return;
            }
        }

        let style = self.current_inline_style();
        // pulldown can hand us text containing literal `\n` (e.g. setext);
        // each inner line maps to a hard break.
        for (i, line) in t.split('\n').enumerate() {
            if i > 0 {
                self.hard_break();
            }
            if !line.is_empty() {
                self.push_span(Span::styled(line.to_string(), style));
            }
        }
    }

    fn code_inline(&mut self, c: CowStr<'a>) {
        if let Some(tbl) = &mut self.table {
            if tbl.in_cell {
                tbl.cell_buf.push_str(&c);
                return;
            }
        }
        let style = self.current_inline_style().patch(self.styles.code);
        self.push_span(Span::styled(c.into_string(), style));
    }

    fn html(&mut self, html: CowStr<'a>, inline: bool) {
        let style = self.current_inline_style();
        for (i, line) in html.lines().enumerate() {
            if i > 0 {
                self.hard_break();
            }
            self.push_span(Span::styled(line.to_string(), style));
        }
        if !inline {
            self.needs_newline = true;
        }
    }

    fn hard_break(&mut self) {
        // End the current line and start a new one in the same block,
        // re-using the subsequent indent of this context (no marker).
        self.flush_current_line();
        self.push_line(Line::default());
    }

    fn horizontal_rule(&mut self) {
        self.flush_current_line();
        if !self.out.is_empty() {
            self.push_blank_line();
        }
        let initial = self.prefix_spans(/*for_marker*/ false);
        let avail = self.wrap_width.saturating_sub(spans_width(&initial)).max(3);
        let mut spans = initial;
        spans.push(Span::styled("─".repeat(avail), self.styles.hr));
        self.out.push(Line::from(spans));
        self.needs_newline = true;
    }

    fn start_link(&mut self, dest: CowStr<'a>) {
        let label_start = self.current.as_ref().map_or(0, |l| l.spans.len());
        self.link = Some(LinkState {
            url: dest.to_string(),
            label_start,
        });
        self.push_inline(self.styles.link);
    }

    fn end_link(&mut self) {
        self.pop_inline();
        if let Some(link) = self.link.take() {
            // Suppress trailing `(url)` when the label already shows it.
            let label_text: String = self
                .current
                .as_ref()
                .map(|l| {
                    l.spans
                        .iter()
                        .skip(link.label_start)
                        .map(|s| s.content.as_ref())
                        .collect()
                })
                .unwrap_or_default();
            if label_text.trim() == link.url {
                return;
            }
            self.push_span(Span::styled(
                format!(" ({})", link.url),
                Style::default().add_modifier(Modifier::DIM),
            ));
        }
    }

    fn image(&mut self, dest: CowStr<'a>, title: CowStr<'a>) {
        let alt = if title.is_empty() {
            "image"
        } else {
            title.as_ref()
        };
        self.push_span(Span::styled(
            format!("[image: {alt}] {dest}"),
            self.styles.image,
        ));
    }

    fn start_table(&mut self, alignments: Vec<Alignment>) {
        self.flush_current_line();
        if !self.out.is_empty() {
            self.push_blank_line();
        }
        self.table = Some(Table {
            alignments,
            rows: Vec::new(),
            in_cell: false,
            cell_buf: String::new(),
            current_row: Vec::new(),
        });
    }

    fn end_table(&mut self) {
        if let Some(t) = self.table.take() {
            let initial = self.prefix_spans(/*for_marker*/ false);
            let avail = self
                .wrap_width
                .saturating_sub(spans_width(&initial))
                .max(20);
            let rendered = super::table::render_table_lines(&t.rows, &t.alignments, avail);
            self.out.push(Line::from(""));
            for row in rendered {
                let mut spans = initial.clone();
                spans.extend(row.spans);
                self.out.push(Line::from(spans));
            }
            self.out.push(Line::from(""));
        }
        self.needs_newline = true;
    }

    // ── Inline style stack ────────────────────────────────────────────

    fn push_inline(&mut self, style: Style) {
        let merged = self.inline.last().copied().unwrap_or_default().patch(style);
        self.inline.push(merged);
    }

    fn pop_inline(&mut self) {
        self.inline.pop();
    }

    fn current_inline_style(&self) -> Style {
        self.inline.last().copied().unwrap_or_default()
    }

    // ── Line plumbing ─────────────────────────────────────────────────

    /// Push an empty new line (will get prefix on flush).
    fn push_line(&mut self, line: Line<'static>) {
        self.flush_current_line();
        let was_pending = self.pending_marker_line;
        // Blockquotes color the entire line, not just the marker.
        let in_blockquote = self
            .indents
            .iter()
            .any(|c| !c.is_list && c.prefix.iter().any(|s| s.content.contains('▌')));
        let style = if in_blockquote {
            self.styles.blockquote
        } else {
            line.style
        };

        self.current_initial = self.prefix_spans(was_pending);
        self.current_subsequent = self.prefix_spans(/*for_marker*/ false);
        self.current_style = style;
        self.current = Some(line);
        self.current_in_code = false;
        self.pending_marker_line = false;
    }

    /// Like `push_line` but flagged so the flush skips wrapping.
    fn push_code_line(&mut self, line: Line<'static>) {
        self.flush_current_line();
        self.current_initial = self.prefix_spans(/*for_marker*/ false);
        self.current_subsequent = self.current_initial.clone();
        self.current_style = line.style;
        self.current = Some(line);
        self.current_in_code = true;
    }

    fn push_span(&mut self, span: Span<'static>) {
        if let Some(line) = self.current.as_mut() {
            line.spans.push(span);
        } else {
            self.push_line(Line::from(vec![span]));
        }
    }

    fn push_blank_line(&mut self) {
        self.flush_current_line();
        self.out.push(Line::from(""));
    }

    /// Flush the in-progress line: prepend indent, re-wrap (unless code),
    /// and push to `out`. Style is preserved per-span across wrap points.
    fn flush_current_line(&mut self) {
        let Some(line) = self.current.take() else {
            return;
        };

        let initial = std::mem::take(&mut self.current_initial);
        let subsequent = std::mem::take(&mut self.current_subsequent);
        let style = self.current_style;
        let in_code = std::mem::replace(&mut self.current_in_code, false);

        if in_code || self.wrap_width == 0 {
            let mut spans = initial;
            spans.extend(line.spans);
            self.out.push(Line::from(spans).style(style));
            return;
        }

        // Wrap at the available inner width per row.
        let initial_width = spans_width(&initial);
        let subsequent_width = spans_width(&subsequent);
        let inner_initial = self.wrap_width.saturating_sub(initial_width).max(4);
        let inner_subsequent = self.wrap_width.saturating_sub(subsequent_width).max(4);

        let wrapped = wrap_styled_line(&line, inner_initial, inner_subsequent);

        if wrapped.is_empty() {
            // Empty line still emits a single (indented) row so blanks survive.
            self.out.push(Line::from(initial).style(style));
            return;
        }
        for (i, row_spans) in wrapped.into_iter().enumerate() {
            let prefix = if i == 0 {
                initial.clone()
            } else {
                subsequent.clone()
            };
            let mut spans = prefix;
            spans.extend(row_spans);
            self.out.push(Line::from(spans).style(style));
        }
    }

    /// Compute the indent prefix for the next emitted line.
    ///
    /// When emitting the marker line of a list item, walk all stack
    /// frames but only the *deepest* list frame swaps in its `marker`;
    /// deeper-still continuation frames are skipped entirely. When
    /// emitting a non-marker line, only the deepest list frame
    /// contributes so continuations don't accumulate every parent
    /// list's prefix.
    fn prefix_spans(&self, for_marker: bool) -> Vec<Span<'static>> {
        let mut out: Vec<Span<'static>> = Vec::new();
        // Top-level gutter so content sits inside the chrome.
        out.push(Span::raw("  "));

        let last_marker_idx = if for_marker {
            self.indents.iter().enumerate().rev().find_map(|(i, c)| {
                if c.marker.is_some() {
                    Some(i)
                } else {
                    None
                }
            })
        } else {
            None
        };
        let last_list_idx = self.indents.iter().rposition(|c| c.is_list);

        for (i, ctx) in self.indents.iter().enumerate() {
            if for_marker {
                if Some(i) == last_marker_idx {
                    if let Some(marker) = &ctx.marker {
                        out.extend(marker.iter().cloned());
                        continue;
                    }
                }
                // Skip parent list frames above the marker: their prefix
                // would double-indent under the marker we just emitted.
                if ctx.is_list && last_marker_idx.is_some_and(|idx| idx > i) {
                    continue;
                }
            } else if ctx.is_list && Some(i) != last_list_idx {
                // Continuation lines: only the deepest list contributes.
                continue;
            }
            out.extend(ctx.prefix.iter().cloned());
        }
        out
    }

    fn finish(mut self) -> Vec<Line<'static>> {
        self.flush_current_line();
        // Trim trailing blank lines; the caller decides surrounding spacing.
        while matches!(self.out.last(), Some(line) if line.spans.iter().all(|s| s.content.trim().is_empty()))
        {
            self.out.pop();
        }
        self.out
    }
}

// ── Helpers ──────────────────────────────────────────────────────────

fn spans_width(spans: &[Span<'_>]) -> usize {
    spans
        .iter()
        .map(|s| UnicodeWidthStr::width(s.content.as_ref()))
        .sum()
}

/// Wrap the spans of a single `Line` to `inner_initial` cols on the first
/// row and `inner_subsequent` on the rest. Style on every output character
/// equals the style of the source span it came from.
///
/// We flatten to a string, run `textwrap` (which understands word breaks
/// + URLs reasonably with `WordSplitter::NoHyphenation`), then walk the
///   flattened string and the wrapped output in lockstep to re-style.
fn wrap_styled_line(
    line: &Line<'_>,
    inner_initial: usize,
    inner_subsequent: usize,
) -> Vec<Vec<Span<'static>>> {
    // Build a flat string + per-character style table.
    let mut flat = String::new();
    let mut style_at: Vec<Style> = Vec::new();
    for span in &line.spans {
        for ch in span.content.chars() {
            style_at.push(span.style);
            flat.push(ch);
        }
    }

    if flat.is_empty() {
        return Vec::new();
    }

    // Handle differing initial vs. subsequent widths by wrapping in two
    // passes: the first line uses `inner_initial`, the rest use
    // `inner_subsequent`.
    let opts_initial = WrapOptions::new(inner_initial.max(1))
        .break_words(false)
        .word_splitter(WordSplitter::NoHyphenation);
    let first_pass = textwrap::wrap(&flat, &opts_initial);

    let mut rows: Vec<String> = Vec::new();
    if let Some(first) = first_pass.first() {
        rows.push(first.to_string());
        // Remainder: everything after the first line, re-wrapped at
        // `inner_subsequent` so wrap geometry stays correct.
        let consumed = char_consumed(&flat, first);
        let rest = skip_leading_spaces(&flat, consumed);
        if !rest.is_empty() {
            let opts_rest = WrapOptions::new(inner_subsequent.max(1))
                .break_words(false)
                .word_splitter(WordSplitter::NoHyphenation);
            for row in textwrap::wrap(rest, &opts_rest) {
                rows.push(row.to_string());
            }
        }
    }

    // Walk char-by-char to re-attach styles.
    let flat_chars: Vec<char> = flat.chars().collect();
    let mut cursor = 0usize;
    let mut out: Vec<Vec<Span<'static>>> = Vec::with_capacity(rows.len());
    for (row_idx, row) in rows.iter().enumerate() {
        if row_idx > 0 {
            // Skip the whitespace textwrap consumed between rows.
            while cursor < flat_chars.len() && flat_chars[cursor] == ' ' {
                cursor += 1;
            }
        }
        let mut row_spans: Vec<Span<'static>> = Vec::new();
        let mut buf = String::new();
        let mut buf_style = style_at.get(cursor).copied().unwrap_or_default();
        for ch in row.chars() {
            // Match against source. If textwrap inserted a synthetic char
            // (rare with NoHyphenation), keep it but don't advance cursor.
            let src = flat_chars.get(cursor).copied();
            if Some(ch) != src {
                buf.push(ch);
                continue;
            }
            let style = style_at[cursor];
            if style != buf_style && !buf.is_empty() {
                row_spans.push(Span::styled(std::mem::take(&mut buf), buf_style));
                buf_style = style;
            }
            buf.push(ch);
            cursor += 1;
        }
        if !buf.is_empty() {
            row_spans.push(Span::styled(buf, buf_style));
        }
        out.push(row_spans);
    }
    out
}

/// Count source characters consumed by the wrapped first row (it may have
/// trailing whitespace stripped by `textwrap`).
fn char_consumed(source: &str, wrapped: &str) -> usize {
    let mut cursor = 0usize;
    let src_chars: Vec<char> = source.chars().collect();
    for ch in wrapped.chars() {
        let c = src_chars.get(cursor).copied();
        if Some(ch) == c {
            cursor += 1;
        }
    }
    cursor
}

fn skip_leading_spaces(source: &str, char_offset: usize) -> &str {
    let mut byte_off = 0usize;
    let mut chars_skipped = 0usize;
    for (i, ch) in source.char_indices() {
        if chars_skipped < char_offset {
            chars_skipped += 1;
            byte_off = i + ch.len_utf8();
            continue;
        }
        if ch == ' ' {
            byte_off = i + ch.len_utf8();
            continue;
        }
        return &source[byte_off..];
    }
    &source[byte_off..]
}

// Render the Writer's output as a `Text` for callers that prefer it.
#[allow(dead_code)]
pub fn render_markdown_text(md: &str, width: usize) -> Text<'static> {
    Text::from(render_markdown(md, width))
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn lines_to_strings(lines: &[Line<'static>]) -> Vec<String> {
        lines
            .iter()
            .map(|l| l.spans.iter().map(|s| s.content.as_ref()).collect())
            .collect()
    }

    #[test]
    fn wraps_plain_text() {
        let out = render_markdown("This is a simple sentence that should wrap.", 18);
        let strs = lines_to_strings(&out);
        // Each output starts with the 2-col gutter.
        for line in &strs {
            assert!(line.starts_with("  "));
        }
        assert!(strs.len() >= 2);
    }

    #[test]
    fn wraps_list_items_preserving_indent() {
        let out = render_markdown("- first second third fourth fifth", 16);
        let strs = lines_to_strings(&out);
        // First line has the bullet, continuations align under the text.
        assert!(strs[0].contains("• first"));
        for cont in &strs[1..] {
            assert!(
                cont.starts_with("    "),
                "continuation should align: {cont:?}"
            );
        }
    }

    #[test]
    fn nested_lists_keep_4space_step() {
        let md = "- outer\n  - inner item\n    - deeper";
        let out = render_markdown(md, 60);
        let strs = lines_to_strings(&out);
        let outer = strs.iter().find(|l| l.contains("outer")).unwrap();
        let inner = strs.iter().find(|l| l.contains("inner")).unwrap();
        let deeper = strs.iter().find(|l| l.contains("deeper")).unwrap();
        // gutter 2 + marker indents = 2, 6, 10
        assert!(outer.starts_with("  • "), "outer: {outer:?}");
        assert!(inner.starts_with("      • "), "inner: {inner:?}");
        assert!(deeper.starts_with("          • "), "deeper: {deeper:?}");
    }

    #[test]
    fn ordered_list_numbers_align() {
        let md = "1. one\n2. two";
        let out = render_markdown(md, 60);
        let strs = lines_to_strings(&out);
        assert!(strs.iter().any(|l| l.contains("1. one")));
        assert!(strs.iter().any(|l| l.contains("2. two")));
    }

    #[test]
    fn does_not_split_long_url_token() {
        // textwrap with NoHyphenation keeps URL-ish tokens intact.
        let url = "https://example.com/a/very/long/path/that/should/stay/on/one/line";
        let out = render_markdown(url, 30);
        let strs = lines_to_strings(&out);
        assert!(
            strs.iter().any(|l| l.contains(url)),
            "URL was split: {strs:?}"
        );
    }

    #[test]
    fn code_block_is_not_wrapped() {
        let md =
            "```\nfn main() { println!(\"hi from a long line that exceeds the width\"); }\n```";
        let out = render_markdown(md, 20);
        let strs = lines_to_strings(&out);
        assert!(strs
            .iter()
            .any(|l| l.contains("println!(\"hi from a long line that exceeds the width\")")));
    }

    #[test]
    fn task_list_renders_checkbox() {
        let md = "- [x] done\n- [ ] todo";
        let out = render_markdown(md, 40);
        let strs = lines_to_strings(&out);
        assert!(strs.iter().any(|l| l.contains("[x] done")));
        assert!(strs.iter().any(|l| l.contains("[ ] todo")));
    }

    #[test]
    fn blockquote_alert_label() {
        let md = "> [!NOTE]\n> remember this";
        let out = render_markdown(md, 60);
        let strs = lines_to_strings(&out);
        assert!(strs.iter().any(|l| l.contains("NOTE")));
        assert!(strs.iter().any(|l| l.contains("remember this")));
    }

    #[test]
    fn heading_hashes_preserved() {
        let out = render_markdown("# Title\n## Sub", 60);
        let strs = lines_to_strings(&out);
        assert!(strs.iter().any(|l| l.contains("# Title")));
        assert!(strs.iter().any(|l| l.contains("## Sub")));
    }

    #[test]
    fn horizontal_rule_renders() {
        let out = render_markdown("a\n\n---\n\nb", 30);
        let strs = lines_to_strings(&out);
        assert!(strs.iter().any(|l| l.contains("─")));
    }
}

#[cfg(test)]
mod visual_demo {
    use super::*;

    /// Run with `cargo test -- --nocapture markdown_visual_demo` to eyeball
    /// the rendered output for manual style/wrap inspection.
    #[test]
    #[ignore]
    fn markdown_visual_demo() {
        let md = include_str!("markdown_demo.md");
        for line in render_markdown(md, 60) {
            let s: String = line.spans.iter().map(|s| s.content.as_ref()).collect();
            println!("{s}");
        }
    }
}
