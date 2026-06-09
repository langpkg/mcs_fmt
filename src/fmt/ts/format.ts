// src/fmt/ts/format.ts
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import { readFile, writeFile }    from '../../common';
    import { glob }                   from 'glob';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔═══════════════════════════════════════ CONST ════════════════════════════════════════╗

    // Expected inner widths (excluding the "// " prefix)
    const L1_INNER                  = 88;
    const L2_INNER                  = 70;
    // L3 is 15% narrower than L2 (rounded to nearest even number for symmetry)
    const L3_INNER                  = Math.round(L2_INNER * 0.85);

    // Patterns
    const RE_L1_OPEN                = /^(\s*)\/\/ (╔)(═+) (\S+) (═+)(╗)\s*$/;
    const RE_L1_CLOSE               = /^(\s*)\/\/ (╚)(═+)(╝)\s*$/;
    const RE_L2_OPEN                = /^(\s*)\/\/ (┌)(─+) (\S+) (─+)(┐)\s*$/;
    const RE_L2_CLOSE               = /^(\s*)\/\/ (└)(─+)(┘)\s*$/;

    // L3 patterns: // ╭── Title ──────────╮ and // ╰──────────────────╯
    const RE_L3_OPEN                = /^(\s*)\/\/ (╭──) (.+?) (─+)(╮)\s*$/;
    const RE_L3_CLOSE               = /^(\s*)\/\/ (╰─+)(╯)\s*$/;

    // Titled-line separator: // ── title ───────
    const RE_TITLED_LINE            = /^(\s*)\/\/ (──) (.+?) (─+)\s*$/;
    const RE_TITLED_LINE_LENIENT    = /^(\s*)\/\/\s*─+\s+\S/;

    // Lenient patterns for detection of malformed markers
    const RE_L1_OPEN_LENIENT        = /^(\s*)\/\/ ╔/;
    const RE_L1_CLOSE_LENIENT       = /^(\s*)\/\/ ╚/;
    const RE_L2_OPEN_LENIENT        = /^(\s*)\/\/ ┌/;
    const RE_L2_CLOSE_LENIENT       = /^(\s*)\/\/ └/;

    // Lenient L3 detection
    const RE_L3_OPEN_LENIENT        = /^(\s*)\/\/ ╭/;
    const RE_L3_CLOSE_LENIENT       = /^(\s*)\/\/ ╰─/;

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ TYPE ════════════════════════════════════════╗

    export type IssueSeverity = 'error' | 'warning';

    export interface FormatIssue {
        file     : string;
        line     : number;
        code     : string;
        message  : string;
        severity : IssueSeverity;
        fixable  : boolean;
        fix?     :
                 | { type: 'replace_line'; line: number; content: string }
                 | { type: 'replace_lines'; startLine: number; endLine: number; content: string }
                 | { type: 'prepend_lines'; content: string }
                 | { type: 'append_lines'; content: string }
                 | { type: 'insert_after_line'; line: number; content: string }
                 | { type: 'insert_before_line'; line: number; content: string }
                 | { type: 'remove_blank_lines'; line: number; count: number };
    }

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CORE ════════════════════════════════════════╗

    // ┌────────────────────────────── GENERATE ────────────────────────────┐

        // Build a correct L1 open line inner content for a given name
        function makeL1Open(name: string): string {

            const total = 84 - name.length;
            const left  = Math.floor(total / 2);
            const right = total - left;
            return '╔' + '═'.repeat(left) + ' ' + name + ' ' + '═'.repeat(right) + '╗';

        }

        // Build a correct L1 close line inner content
        function makeL1Close(name: string): string {
            const open = makeL1Open(name);
            return '╚' + '═'.repeat(open.length - 2) + '╝';
        }

        // Build a correct L2 open line inner content for a given name
        // Left side gets +1 extra dash (left-biased, matching observed style)
        function makeL2Open(name: string): string {
            const total = 66 - name.length;
            const right = Math.floor(total / 2) - 1;
            const left  = total - right;
            return '┌' + '─'.repeat(left) + ' ' + name + ' ' + '─'.repeat(right) + '┐';
        }

        // Build a correct L2 close line inner content
        function makeL2Close(name: string): string {
            const open = makeL2Open(name);
            return '└' + '─'.repeat(open.length - 2) + '┘';
        }

        // Build a correct L3 open line: // ╭── Title ──────────╮
        // Format: "╭── <title> <right-fill>──╮" where total inner width = L3_INNER
        // Left anchor is always "╭── " (4 chars), right anchor is " ──╮" minimum
        function makeL3Open(title: string): string {
            // inner = "╭── " + title + " " + right-dashes + "╮"
            // We want total = L3_INNER chars
            const leftAnchor = '╭── ';
            const minRight   = ' ──╮';
            const fixed      = leftAnchor.length + title.length + minRight.length;
            const extra      = Math.max(0, L3_INNER - fixed);
            return leftAnchor + title + ' ' + '─'.repeat(extra + 2) + '╮';
        }

        // Build a correct L3 close line: // ╰──────────────────╯  (same inner width as open)
        function makeL3Close(title: string): string {
            const open = makeL3Open(title);
            return '╰' + '─'.repeat(open.length - 2) + '╯';
        }

        // Build a correct titled-line separator: // ── title ───────
        // Format: "── <title> <right-fill>─" where total inner width = L3_INNER
        function makeTitledLine(title: string): string {
            // inner = "── " + title + " " + right-dashes
            // We want total = L3_INNER chars
            const leftAnchor = '── ';
            const fixed      = leftAnchor.length + title.length + 1; // +1 for space before dashes
            const dashes     = Math.max(1, L3_INNER - fixed);
            return leftAnchor + title + ' ' + '─'.repeat(dashes);
        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌─────────────────────────────── HEADER ─────────────────────────────┐

        // Helper: Shorten file path to start from /src
        function shortenPath(filepath: string): string {
            const forwardPath = filepath.replace(/\\/g, '/');
            const srcIdx = forwardPath.indexOf('/src/');
            if (srcIdx !== -1) {
                return forwardPath.substring(srcIdx);
            }
            return forwardPath;
        }

        // Expected file header structure:
        //
        //   // <rel-path-from-src-root>     ← FIRST line (fixed)
        //   //                              ← separator   (fixed)
        //   // [optional user comment lines, any number]
        //   // Made with ❤️ by Maysara. ← LAST line  (fixed)
        //
        // Rules:
        //   - Line 1 must be the path comment.
        //   - Line 2 must be a bare "//".
        //   - The last consecutive "//" line of the header block must be the author line.
        //   - User comment lines between line 2 and the author line are preserved untouched.
        //   - If the author line exists but is not last (user comments follow it), the whole
        //     header block is restructured: path / // / [user comments] / author.
        export function checkFileHeader(filepath: string, srcRoot: string, content: string): FormatIssue[] {

            // ╭── Init ──────────────────────────────────────────────────╮

                const issues: FormatIssue[] = [];
                const lines = content.split('\n').map(line => line.trimEnd());

                // Derive the short relative path starting from 'src', 'test', or 'bench'.
                // Handles both absolute paths ("/project/src/foo.ts" → "src/foo.ts") and
                // relative paths ("src/foo.ts" or "src\foo.ts" → "src/foo.ts").
                const normalizedPath = filepath.replace(/\\/g, '/');
                let rel: string;
                let srcIdx = normalizedPath.indexOf('/src/');
                if (srcIdx === -1) srcIdx = normalizedPath.indexOf('/test/');
                if (srcIdx === -1) srcIdx = normalizedPath.indexOf('/bench/');
                if (srcIdx !== -1) {
                    // Absolute path: strip everything before and including the leading slash
                    rel = normalizedPath.substring(srcIdx + 1);
                } else if (/^(src|test|bench)\//.test(normalizedPath)) {
                    // Already a relative path starting with src/ test/ bench/
                    rel = normalizedPath;
                } else {
                    // Unknown structure - use normalized form as-is
                    rel = normalizedPath;
                }

                const expectedPath   = `// ${rel}`;
                const expectedSep    = '//';
                const expectedAuthor = '// Made with \u2764\ufe0f by Maysara.';

            // ╰──────────────────────────────────────────────────────────╯


            // ╭── Locate where the header should start ──────────────────╮

                let startIdx = 0;

                // Skip shebang
                if (lines[0]?.startsWith('#!')) {
                    startIdx = 1;
                    if (lines[1]?.trim() === '') startIdx = 2;
                }

                // Skip leading block comments (/* eslint-disable ... */) and blank lines -
                // these must stay above the header and are never moved.
                while (startIdx < lines.length) {
                    const l = lines[startIdx] ?? '';
                    if (l.trimStart().startsWith('/*') || l.trimStart().startsWith('*') || l.trim() === '') {
                        startIdx++;
                    } else {
                        break;
                    }
                }

            // ╰──────────────────────────────────────────────────────────╯


            // ╭── Find the header block ─────────────────────────────────╮

                // all consecutive "//" lines from startIdx

                let headerEnd = startIdx; // exclusive: first line that is NOT part of the header
                while (headerEnd < lines.length && (lines[headerEnd] ?? '').startsWith('//')) {
                    // Stop at section markers - they start with '//' but are not header lines
                    const hl = lines[headerEnd] ?? '';
                    if (RE_L1_OPEN_LENIENT.test(hl) || RE_L1_CLOSE_LENIENT.test(hl) ||
                    RE_L2_OPEN_LENIENT.test(hl) || RE_L2_CLOSE_LENIENT.test(hl)) {
                        break;
                    }
                    headerEnd++;
                }
                const headerLen   = headerEnd - startIdx; // number of "//" lines found

                const firstLine   = lines[startIdx] ?? '';
                // const secondLine = lines[startIdx + 1] ?? '';
                const lastLine    = headerLen > 0 ? (lines[headerEnd - 1] ?? '') : '';

                const displayPath = shortenPath(rel);

            // ╰──────────────────────────────────────────────────────────╯


            // ╭── Check 1: no "//" block at all → HEADER_MISSING ────────╮

                if (headerLen === 0 || !firstLine.startsWith('//')) {
                    issues.push({
                        file            : filepath,
                        line            : startIdx + 1,
                        code            : 'HEADER_MISSING',
                        message         : 'Missing file header (path + author comment)',
                        severity        : 'warning',
                        fixable         : true,
                        fix             : {
                            type        : 'prepend_lines',
                            content     : `${expectedPath}\n${expectedSep}\n${expectedAuthor}\n`,
                        },
                    });
                    return issues;
                }

            // ╰──────────────────────────────────────────────────────────╯


            // ╭── Collect user comment lines ────────────────────────────╮

                // everything between line 2 and the author
                // Strip the path (line 1), the separator (line 2), any bare "//" separators
                // adjacent to the author, and the author line itself - what remains are the
                // user's descriptive comment lines that must be preserved in the middle.
                const rawBlock = lines.slice(startIdx, headerEnd); // all "//" lines

                // Find where the author line is within the block (first occurrence)
                const authorIdxInBlock = rawBlock.indexOf(expectedAuthor);

                // Normalize a single "//" comment line: "//text" → "// text", "//" stays "//".
                // Lines that already start with "// " are left untouched.
                const normalizeCommentLine = (line: string): string => {
                    if (line === '//' || line.startsWith('// ')) return line;
                    // "//text" - insert a space after the slashes
                    if (line.startsWith('//')) return '// ' + line.slice(2).trimStart();
                    return line;
                };

                // User comment lines = everything after the separator (index 1) that is not
                // the author line and not a bare "//" that is adjacent only to the author.
                // Strategy: take lines[2..end], remove the author line and any bare "//"
                // that sit immediately before or after it (they are separator noise),
                // keeping all genuine descriptive comment lines.
                // Detect lines that are author-like (invalid or duplicate "Made with ❤️" lines)
                // so they are removed from user comments and replaced by the expected author.
                const isAuthorLike = (line: string) => /^\/\/\s*Made with \u2764\ufe0f/.test(line);

                let userComments: string[] = [];
                if (headerLen > 2) {
                    const middle = rawBlock.slice(2); // after path + separator
                    if (authorIdxInBlock !== -1) {
                        // Author found - everything before it (excluding bare "//" right before author)
                        // plus everything after it (excluding bare "//" right after author if any)
                        const beforeAuthor = rawBlock.slice(2, authorIdxInBlock);
                        let afterAuthor  = rawBlock
                        .slice(authorIdxInBlock + 1)
                        .filter((line) => line !== expectedAuthor); // drop duplicate author tail lines

                        // Also drop author-like lines (invalid/duplicate "Made with" lines) and
                        // any bare "//" adjacent to them from before/after
                        const filteredBefore = beforeAuthor.filter((l) => !isAuthorLike(l));
                        const filteredAfter  = afterAuthor.filter((l) => !isAuthorLike(l));

                        // Trim trailing bare "//" from filteredBefore (separator before author)
                        let bEnd = filteredBefore.length;
                        while (bEnd > 0 && filteredBefore[bEnd - 1] === expectedSep) bEnd--;

                        // Trim leading bare "//" from filteredAfter (separator after author)
                        let aStart = 0;
                        while (aStart < filteredAfter.length && filteredAfter[aStart] === expectedSep) aStart++;

                        userComments = [
                            ...filteredBefore.slice(0, bEnd).map(normalizeCommentLine),
                            ...filteredAfter.slice(aStart).map(normalizeCommentLine),
                        ];
                    } else {
                        // No author in block yet - all middle lines are user comments
                        // (strip any bare "//" at the very end, those are trailing separators)
                        // Also remove any author-like lines (invalid "Made with" lines)
                        const filteredMiddle = middle.filter((l) => !isAuthorLike(l));
                        let end = filteredMiddle.length;
                        while (end > 0 && filteredMiddle[end - 1] === expectedSep) end--;
                        userComments = filteredMiddle.slice(0, end).map(normalizeCommentLine);
                    }
                }

            // ╰──────────────────────────────────────────────────────────╯


            // ╭── Build the canonical header block ──────────────────────╮

                // path / // / [user comments] / author
                // Insert a "//" separator before author only if there are user comments
                const canonicalBlock: string[] = [
                    expectedPath,
                    expectedSep,
                    ...userComments,
                    ...(userComments.length > 0 ? [expectedSep] : []),
                    expectedAuthor,
                ];

            // ╰──────────────────────────────────────────────────────────╯


            // ╭── Compare ───────────────────────────────────────────────╮

                // Compareand emit a single replace_lines fix if anything differs
                const currentBlock = rawBlock;
                const blocksDiffer =
                currentBlock.length !== canonicalBlock.length ||
                currentBlock.some((l, i) => l !== canonicalBlock[i]);

                if (blocksDiffer) {
                    // Determine the most descriptive error code
                    let code = 'HEADER_WRONG_PATH';
                    if (firstLine === expectedPath) {
                        code = lastLine !== expectedAuthor ? 'HEADER_WRONG_AUTHOR' : 'HEADER_WRONG_STRUCTURE';
                    }

                    issues.push({
                        file            : filepath,
                        line            : startIdx + 1,
                        code,
                        message         :
                        firstLine !== expectedPath
                        ? `Wrong file header path - expected "// ${displayPath}"`
                        : `Header must end with "${expectedAuthor}" as the last line`,

                        severity        : 'warning',
                        fixable         : true,

                        fix             : {
                            type        : 'replace_lines',
                            startLine   : startIdx + 1,         // 1-indexed, inclusive
                            endLine     : startIdx + headerLen, // 1-indexed, inclusive
                            content     : canonicalBlock.join('\n'),
                        },
                    });
                }

            // ╰──────────────────────────────────────────────────────────╯


            // ╭── Check for duplicate / BOM-prefixed stale header after canonical block ──╮

                // eslint-disable-next-line no-irregular-whitespace
                // A BOM (﻿) or stale "//" block immediately after the header
                // (e.g. a second copy from a botched merge or editor save) must be
                // stripped. Detect it: starting at headerEnd, skip any line whose
                // first non-BOM character starts with "//" (but not a section marker)
                // and that does NOT match the canonical block. If such lines exist,
                // emit a replace_lines fix that covers them with empty content.
                const BOM = '\uFEFF';
                let dupeEnd = headerEnd;
                while (dupeEnd < lines.length) {
                    const raw = lines[dupeEnd] ?? '';
                    const stripped = raw.startsWith(BOM) ? raw.slice(1) : raw;
                    // Must look like a header comment line (starts with "//")
                    if (!stripped.startsWith('//')) break;
                    // Stop at section markers
                    if (RE_L1_OPEN_LENIENT.test(stripped) || RE_L1_CLOSE_LENIENT.test(stripped) ||
                    RE_L2_OPEN_LENIENT.test(stripped) || RE_L2_CLOSE_LENIENT.test(stripped)) break;
                    dupeEnd++;
                }

                if (dupeEnd > headerEnd) {
                    // There is a stale header block: lines [headerEnd..dupeEnd-1] (1-indexed)
                    issues.push({
                        file        : filepath,
                        line        : headerEnd + 1,
                        code        : 'HEADER_DUPLICATE',
                        message     : 'Duplicate / stale header block after canonical header',
                        severity    : 'warning',
                        fixable     : true,
                        fix         : {
                            type      : 'replace_lines',
                            startLine : headerEnd + 1,   // 1-indexed, inclusive
                            endLine   : dupeEnd,         // 1-indexed, inclusive
                            content   : '',
                        },
                    });
                }

            // ╰───────────────────────────────────────────────────────────────────────────╯

            return issues;

        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌──────────────────────────────── PARSE ─────────────────────────────┐

        // Helper: Extract leading spaces count from a line
        function getIndentLevel(line: string): number {
            const match = /^(\s*)/.exec(line);
            return match ? match[1].length : 0;
        }

        // Helper: Remove string literals, line/block comments, and regex literals from a
        // line so that bracket characters inside them do not affect brace-depth tracking.
        //
        // Handles: 'single', "double", `template` quoted strings (with escape sequences),
        // // line comments, /* inline block comments */, and /regex/ literals.
        // Returns the sanitised line with string/comment/regex content replaced by spaces
        // (preserving character positions so leading-indent checks still work).
        function stripStringsAndComments(line: string): string {
            const out: string[] = [];
            let i = 0;
            const len = line.length;

            // Track the last non-whitespace char emitted to distinguish regex `/` from
            // division `/`. A `/` is a regex delimiter when it follows an operator,
            // punctuation, or start-of-content - NOT when it follows `)`, `]`, or a
            // word/digit character (those are value-producing and make `/` division).
            let lastSignificantChar = '';

            while (i < len) {
                const ch = line[i];

                // Line comment: // → skip the rest of the line
                if (ch === '/' && line[i + 1] === '/') {
                    while (i < len) { out.push(' '); i++; }
                    break;
                }

                // Inline block comment: /* ... */
                if (ch === '/' && line[i + 1] === '*') {
                    out.push(' '); out.push(' '); i += 2;
                    while (i < len) {
                        if (line[i] === '*' && line[i + 1] === '/') {
                            out.push(' '); out.push(' '); i += 2;
                            break;
                        }
                        out.push(' '); i++;
                    }
                    continue;
                }

                // Regex literal: /.../ when not preceded by a value-producing token.
                // After `)`, `]`, an identifier char, or a digit, `/` is division - pass through.
                if (ch === '/') {
                    const isDivision = /[\w\d)\]]/.test(lastSignificantChar);
                    if (!isDivision) {
                        // Consume the regex body, respecting escape sequences and [...] classes
                        out.push(' '); i++; // opening /
                        while (i < len) {
                            const rc = line[i];
                            if (rc === '\\') {
                                out.push(' '); out.push(' '); i += 2; // escaped char
                                continue;
                            }
                            if (rc === '[') {
                                // Character class: consume until closing ]
                                out.push(' '); i++;
                                while (i < len) {
                                    const cc = line[i];
                                    if (cc === '\\') { out.push(' '); out.push(' '); i += 2; continue; }
                                    out.push(' '); i++;
                                    if (cc === ']') break;
                                }
                                continue;
                            }
                            if (rc === '/') {
                                out.push(' '); i++; // closing /
                                break;
                            }
                            out.push(' '); i++;
                        }
                        // Consume optional flags (g, i, m, s, u, y)
                        while (i < len && /[gimsuy]/.test(line[i])) { out.push(' '); i++; }
                        lastSignificantChar = ' '; // regex is a value; next / would be division
                        continue;
                    }
                }

                // String literals: ', ", `
                if (ch === '\'' || ch === '"' || ch === '`') {
                    const quote = ch;
                    out.push(' '); i++;                          // opening quote → space
                    while (i < len) {
                        const sc = line[i];
                        if (sc === '\\') {
                            out.push(' '); out.push(' '); i += 2; // escaped char → 2 spaces
                            continue;
                        }
                        if (sc === quote) {
                            out.push(' '); i++;                  // closing quote → space
                            break;
                        }
                        out.push(' '); i++;                      // string content → space
                    }
                    lastSignificantChar = ' '; // string is a value
                    continue;
                }

                out.push(ch); i++;
                if (ch !== ' ' && ch !== '\t') lastSignificantChar = ch;
            }

            return out.join('');
        }

        // Helper: Check if a name follows snake_case convention
        function isValidSnakeCase(name: string): boolean {
            return /^[a-z0-9_]+(\.[a-z0-9]+)?$/.test(name);
        }

        // Check file and folder naming conventions (snake_case)
        export function checkNaming(dir: string): FormatIssue[] {
            const issues: FormatIssue[] = [];

            try {
                const files = glob.sync(`${dir}/**/*.ts`, { dot: false });

                for (const filepath of files) {
                    // Extract file name without extension
                    const fileName = filepath.split(/[\\/]/).pop() ?? '';
                    const nameWithoutExt = fileName.replace(/\.ts$/, '');

                    // Check file naming
                    if (!isValidSnakeCase(nameWithoutExt)) {
                        issues.push({
                            file            : filepath,
                            line            : 1,
                            code            : 'FILE_NAME_INVALID',
                            message         : `File name "${fileName}" must follow snake_case convention (e.g., my_file.ts)`,
                            severity        : 'warning',
                            fixable         : false,
                        });
                    }

                    // Check folder names in the path
                    const pathParts = filepath.split(/[\\/]/);
                    for (let i = pathParts.indexOf(dir) + 1; i < pathParts.length - 1; i++) {
                        const folder = pathParts[i];
                        if (folder && !isValidSnakeCase(folder)) {
                            issues.push({
                                file            : filepath,
                                line            : 1,
                                code            : 'FOLDER_NAME_INVALID',
                                message         : `Folder name "${folder}" must follow snake_case convention (e.g., my_folder/)`,
                                severity        : 'warning',
                                fixable         : false,
                            });
                            break; // Only report once per file
                        }
                    }
                }
            } catch {
                // Silently ignore glob errors
            }

            return issues;
        }

        // Parse a single file and return all format issues found
        export function parseFile(filepath: string, content: string): FormatIssue[] {
            const issues: FormatIssue[] = [];
            const lines = content.split('\n').map(line => line.trimEnd());
            const l1Stack: {
                lineno          : number;
                name            : string;
                indent          : string;
                indentNum       : number;
            }[] = [];
            const l2Stack: {
                lineno          : number;
                name            : string;
                indent          : string;
                indentNum       : number;
            }[] = [];
            const l3Stack: {
                lineno          : number;
                title           : string;
                name            : string;  // alias for title, used by shared indentation check
                indent          : string;
                indentNum       : number;
            }[] = [];
            let braceDepth = 0; // Track { [ } ] nesting depth for current section
            let parenScopeDepth = 0; // Track multi-line ( … ) scope depth separately
            const l2BraceDepthStack: number[] = []; const l2ParenDepthStack: number[] = []; // Saved depth values when entering L2 sections
            const l3BraceDepthStack: number[] = []; const l3ParenDepthStack: number[] = []; // Saved depth values when entering L3 sections

            const push = (
                line            : number,
                code            : string,
                message         : string,
                severity        : IssueSeverity,
                fixable         : boolean,
                fix?            : FormatIssue['fix']
            ) =>
            issues.push({
                file            : filepath,
                line            : line,
                code            : code,
                message         : message,
                severity        : severity,
                fixable         : fixable,
                fix             : fix,
            });

            lines.forEach((raw, idx) => {
                const lineno = idx + 1;

                // ── L1 open ─────────────────────────────────────────────────

                const m1o = RE_L1_OPEN.exec(raw);
                if (m1o) {
                    // Before opening a new L1, close any unclosed L2s and the previous L1

                    if (l2Stack.length > 0) {
                        for (const unc of l2Stack) {
                            const closeContent = '\n\n' + unc.indent + '// ' + makeL2Close(unc.name);
                            push(
                                unc.lineno,
                                'L2_UNCLOSED',
                                `L2 section "${unc.name}" is never closed`,
                                'error',
                                true,
                                { type: 'insert_before_line', line: lineno, content: closeContent }
                            );
                        }
                        l2Stack.length = 0;
                        l2BraceDepthStack.length = 0; l2ParenDepthStack.length = 0;
                    }

                    if (l1Stack.length > 0) {
                        const unc = l1Stack.pop()!;
                        const closeContent = '\n' + unc.indent + '// ' + makeL1Close(unc.name) + '\n\n\n';
                        push(
                            unc.lineno,
                            'L1_UNCLOSED',
                            `L1 section "${unc.name}" is never closed`,
                            'error',
                            true,
                            { type: 'insert_before_line', line: lineno, content: closeContent }
                        );
                    }

                    const [, indent, , , name, ,] = m1o;
                    const indentNum = getIndentLevel(indent);
                    const inner = raw.trimStart().slice(3); // after "// "
                    const correct = makeL1Open(name);

                    // Check blank lines before L1 (3 if not first line, 0 if at start)
                    if (idx > 0) {
                        let blankCount = 0;
                        for (let i = idx - 1; i >= 0 && lines[i].trim().length === 0; i--) {
                            blankCount++;
                        }
                        if (blankCount !== 3) {
                            if (blankCount < 3) {
                                const needed = 3 - blankCount;
                                push(
                                    idx + 1,
                                    'L1_BLANK_BEFORE',
                                    `L1 section "${name}" must be preceded by 3 blank lines (has ${blankCount}, needs ${needed} more)`,
                                    'warning',
                                    true,
                                    {
                                        type: 'insert_before_line',
                                        line: idx + 1,
                                        content: '\n'.repeat(needed),
                                    }
                                );
                            } else {
                                const excess = blankCount - 3;
                                push(
                                    idx + 1,
                                    'L1_BLANK_BEFORE',
                                    `L1 section "${name}" must be preceded by 3 blank lines (has ${blankCount}, remove ${excess})`,
                                    'warning',
                                    true,
                                    { type: 'remove_blank_lines', line: idx + 1, count: excess }
                                );
                            }
                        }
                    }

                    if (inner.length !== L1_INNER) {
                        push(
                            lineno,
                            'L1_WIDTH',
                            `L1 section "${name}" has wrong width (${inner.length}, expected ${L1_INNER})`,
                            'warning',
                            true,
                            {
                                type: 'replace_line',
                                line: lineno,
                                content: indent + '// ' + correct,
                            }
                        );
                    } else if (inner !== correct) {
                        push(
                            lineno,
                            'L1_CENTERING',
                            `L1 section "${name}" is not correctly centered`,
                            'warning',
                            true,
                            {
                                type: 'replace_line',
                                line: lineno,
                                content: indent + '// ' + correct,
                            }
                        );
                    }

                    l1Stack.push({ lineno, name, indent, indentNum });
                    braceDepth = 0; parenScopeDepth = 0; // Reset depth for new section
                    return;
                }

                // Detect malformed L1 open markers
                if (RE_L1_OPEN_LENIENT.test(raw)) {
                    const indent = raw.match(/^(\s*)/)?.[1] ?? '';
                    // Try to extract section name from malformed marker
                    // Look for a word surrounded by spaces (the proper format is " NAME ")
                    let nameMatch = raw.match(/ (\w+) /);
                    // If not found, try to find any word between ╔ and ╗
                    if (!nameMatch) {

                        nameMatch = raw.match(/╔.*?(\w+).*?╗/);

                    }
                    // If still not found, try to get the last word before ╗
                    if (!nameMatch) {
                        nameMatch = raw.match(/(\w+)\s*═*\s*╗/);
                    }
                    const sectionName = nameMatch?.[1] ?? 'NAME';
                    const indentNum = getIndentLevel(indent);

                    push(
                        lineno,
                        'L1_INVALID_CHARS',
                        'L1 section marker has invalid characters or formatting',
                        'warning',
                        true,
                        {
                            type            : 'replace_line',
                            line            : lineno,
                            content         : indent + '// ' + makeL1Open(sectionName),
                        }
                    );

                    // Push to stack so matching close marker can be found
                    l1Stack.push({ lineno, name: sectionName, indent, indentNum });
                    braceDepth = 0; parenScopeDepth = 0;
                    return;
                }

                // ── L1 close ────────────────────────────────────────────────

                const m1c = RE_L1_CLOSE.exec(raw);
                if (m1c) {
                    const [, indent] = m1c;
                    const inner = raw.trimStart().slice(3);

                    // Flush any open L3 sections first - an L3 still open when the parent
                    // L1 closes was never closed; insert its close just before this line.
                    while (l3Stack.length > 0) {
                        const unc = l3Stack.pop()!;
                        push(
                            unc.lineno, 'L3_UNCLOSED',
                            `L3 section "${unc.title}" is never closed`,
                            'error', true,
                            {
                                type    : 'insert_before_line',
                                line    : lineno,
                                content : '\n' + unc.indent + '// ' + makeL3Close(unc.title),
                            }
                        );
                        braceDepth      = l3BraceDepthStack.length  > 0 ? l3BraceDepthStack.pop()!  : 0;
                        parenScopeDepth = l3ParenDepthStack.length   > 0 ? l3ParenDepthStack.pop()!  : 0;
                    }

                    if (l2Stack.length > 0) {
                        // Close all unclosed L2s before this L1 close
                        for (let i = l2Stack.length - 1; i >= 0; i--) {
                            const unc = l2Stack[i];
                            const closeContent = '\n\n' + unc.indent + '// ' + makeL2Close(unc.name);
                            push(
                                unc.lineno,
                                'L2_UNCLOSED',
                                `L2 section "${unc.name}" is never closed`,
                                'error',
                                true,
                                { type: 'insert_before_line', line: lineno, content: closeContent }
                            );
                        }
                        l2Stack.length = 0;
                        l2BraceDepthStack.length = 0; l2ParenDepthStack.length = 0;
                    }

                    if (l1Stack.length === 0) {
                        push(
                            lineno,
                            'L1_UNMATCHED_CLOSE',
                            'L1 close (╚) with no matching open (╔)',
                            'error',
                            false
                        );
                    } else {
                        const opened = l1Stack.pop()!;
                        const correct = makeL1Close(opened.name);
                        if (inner !== correct)
                        push(
                            lineno,
                            'L1_CLOSE_WIDTH',
                            `L1 close for "${opened.name}" has wrong width`,
                            'warning',
                            true,
                            {
                                type: 'replace_line',
                                line: lineno,
                                content: indent + '// ' + correct,
                            }
                        );
                        braceDepth = 0; parenScopeDepth = 0; // Reset depth when closing section
                    }
                    return;
                }

                // Detect malformed L1 close markers
                if (RE_L1_CLOSE_LENIENT.test(raw)) {
                    const indent = raw.match(/^(\s*)/)?.[1] ?? '';
                    // Try to extract section name from the last opened L1 section
                    const sectionName = l1Stack.length > 0 ? l1Stack[l1Stack.length - 1].name : 'NAME';
                    push(
                        lineno,
                        'L1_INVALID_CHARS',
                        'L1 close marker has invalid characters',
                        'warning',
                        true,
                        {
                            type: 'replace_line',
                            line: lineno,
                            content: indent + '// ' + makeL1Close(sectionName),
                        }
                    );
                    // Pop from stack if there's a matching open
                    if (l1Stack.length > 0) {
                        l1Stack.pop();
                        braceDepth = 0; parenScopeDepth = 0;
                    }
                    return;
                }

                // ── L2 open ─────────────────────────────────────────────────

                const m2o = RE_L2_OPEN.exec(raw);
                if (m2o) {
                    const [, indent, , , name] = m2o;
                    const indentNum = getIndentLevel(indent);

                    // Compute the required indent for this L2:
                    //   - If inside an L1: l1.indentNum + 4 + braceDepth * 4
                    //     (braceDepth reflects how many { } blocks deep we are within the L1)
                    //   - Otherwise: use the marker's own indent as-is
                    let effectiveIndent = indent;
                    let effectiveIndentNum = indentNum;
                    if (l1Stack.length > 0) {
                        const l1 = l1Stack[l1Stack.length - 1];
                        const requiredIndentNum = l1.indentNum + 4 + braceDepth * 4;
                        effectiveIndent = ' '.repeat(requiredIndentNum);
                        effectiveIndentNum = requiredIndentNum;
                    }

                    // Flush any open L3 sections - a new L2 sibling ends any L3 that was
                    // left open inside the previous L2 block.
                    while (l3Stack.length > 0) {
                        const unc = l3Stack.pop()!;
                        push(
                            unc.lineno, 'L3_UNCLOSED',
                            `L3 section "${unc.title}" is never closed`,
                            'error', true,
                            {
                                type    : 'insert_before_line',
                                line    : lineno,
                                content : '\n' + unc.indent + '// ' + makeL3Close(unc.title),
                            }
                        );
                        braceDepth      = l3BraceDepthStack.length  > 0 ? l3BraceDepthStack.pop()!  : 0;
                        parenScopeDepth = l3ParenDepthStack.length   > 0 ? l3ParenDepthStack.pop()!  : 0;
                    }

                    // Close any unclosed L2s at the same effective indent level (sibling sections)
                    while (l2Stack.length > 0 && l2Stack[l2Stack.length - 1].indentNum >= effectiveIndentNum) {
                        const unc = l2Stack.pop()!;
                        const closeContent = '\n\n' + unc.indent + '// ' + makeL2Close(unc.name);
                        push(
                            unc.lineno,
                            'L2_UNCLOSED',
                            `L2 section "${unc.name}" is never closed`,
                            'error',
                            true,
                            { type: 'insert_before_line', line: lineno, content: closeContent }
                        );
                    }

                    const inner = raw.trimStart().slice(3);
                    const correct = makeL2Open(name);

                    if (l1Stack.length === 0)
                    push(
                        lineno,
                        'L2_OUTSIDE_L1',
                        `L2 section "${name}" must be inside an L1 section`,
                        'error',
                        false
                    );

                    // Check blank lines before L2 (2 if not first L2 in parent L1, 0 if first)
                    let isFirstL2InL1 = true;
                    for (let i = idx - 1; i >= 0; i--) {
                        if (RE_L1_OPEN.test(lines[i])) break; // Reached parent L1
                        if (RE_L2_OPEN.test(lines[i]) || RE_L2_CLOSE.test(lines[i])) {
                            isFirstL2InL1 = false;
                            break;
                        }
                    }

                    if (!isFirstL2InL1) {
                        let blankCount = 0;
                        for (let i = idx - 1; i >= 0 && lines[i].trim().length === 0; i--) {
                            blankCount++;
                        }
                        if (blankCount !== 2) {
                            if (blankCount < 2) {
                                const needed = 2 - blankCount;
                                push(
                                    idx + 1,
                                    'L2_BLANK_BEFORE',
                                    `L2 section "${name}" must be preceded by 2 blank lines (has ${blankCount}, needs ${needed} more)`,
                                    'warning',
                                    true,
                                    {
                                        type: 'insert_before_line',
                                        line: idx + 1,
                                        content: '\n'.repeat(needed),
                                    }
                                );
                            } else {
                                const excess = blankCount - 2;
                                push(
                                    idx + 1,
                                    'L2_BLANK_BEFORE',
                                    `L2 section "${name}" must be preceded by 2 blank lines (has ${blankCount}, remove ${excess})`,
                                    'warning',
                                    true,
                                    { type: 'remove_blank_lines', line: idx + 1, count: excess }
                                );
                            }
                        }
                    }

                    // Enforce L2 marker indentation
                    if (indentNum !== effectiveIndentNum) {
                        push(
                            lineno,
                            'L2_INDENT',
                            `L2 section "${name}" must be indented by ${effectiveIndentNum} spaces (currently ${indentNum})`,
                            'warning',
                            true,
                            { type: 'replace_line', line: lineno, content: effectiveIndent + '// ' + correct }
                        );
                    } else if (inner.length !== L2_INNER) {
                        push(
                            lineno,
                            'L2_WIDTH',
                            `L2 section "${name}" has wrong width (${inner.length}, expected ${L2_INNER})`,
                            'warning',
                            true,
                            { type: 'replace_line', line: lineno, content: effectiveIndent + '// ' + correct }
                        );
                    } else if (inner !== correct) {
                        push(
                            lineno,
                            'L2_CENTERING',
                            `L2 section "${name}" is not correctly centered`,
                            'warning',
                            true,
                            { type: 'replace_line', line: lineno, content: effectiveIndent + '// ' + correct }
                        );
                    }

                    l2Stack.push({ lineno, name, indent: effectiveIndent, indentNum: effectiveIndentNum });
                    l2BraceDepthStack.push(braceDepth); l2ParenDepthStack.push(parenScopeDepth); // Save parent depth
                    braceDepth = 0; parenScopeDepth = 0; // Reset depth when entering new L2 section
                    return;
                }

                // ── L2 close ────────────────────────────────────────────────

                const m2c = RE_L2_CLOSE.exec(raw);
                if (m2c) {
                    // Flush any open L3 sections - an L3 still open when its parent L2
                    // closes was never closed; insert its close just before this L2 close.
                    while (l3Stack.length > 0) {
                        const unc = l3Stack.pop()!;
                        push(
                            unc.lineno, 'L3_UNCLOSED',
                            `L3 section "${unc.title}" is never closed`,
                            'error', true,
                            {
                                type    : 'insert_before_line',
                                line    : lineno,
                                content : '\n' + unc.indent + '// ' + makeL3Close(unc.title),
                            }
                        );
                        braceDepth      = l3BraceDepthStack.length  > 0 ? l3BraceDepthStack.pop()!  : 0;
                        parenScopeDepth = l3ParenDepthStack.length   > 0 ? l3ParenDepthStack.pop()!  : 0;
                    }

                    if (l2Stack.length === 0) {
                        push(
                            lineno,
                            'L2_UNMATCHED_CLOSE',
                            'L2 close (└) with no matching open (┌)',
                            'error',
                            false
                        );
                    } else {
                        const opened = l2Stack.pop()!;
                        const correct = makeL2Close(opened.name);
                        // Use the indent from the matching open (already corrected for L1 nesting)
                        const expectedIndent = opened.indent;
                        const expectedLine = expectedIndent + '// ' + correct;
                        if (raw !== expectedLine)
                        push(
                            lineno,
                            'L2_CLOSE_WIDTH',
                            `L2 close for "${opened.name}" has wrong width or indentation`,
                            'warning',
                            true,
                            {
                                type: 'replace_line',
                                line: lineno,
                                content: expectedLine,
                            }
                        );
                        braceDepth = l2BraceDepthStack.length > 0 ? l2BraceDepthStack.pop()! : 0; parenScopeDepth = l2ParenDepthStack.length > 0 ? l2ParenDepthStack.pop()! : 0;
                    }
                    return;
                }

                // Detect malformed L2 close markers
                if (RE_L2_CLOSE_LENIENT.test(raw)) {
                    const indent = raw.match(/^(\s*)/)?.[1] ?? '';
                    // Try to extract section name from the last opened L2 section
                    const sectionName = l2Stack.length > 0 ? l2Stack[l2Stack.length - 1].name : 'NAME';
                    push(
                        lineno,
                        'L2_INVALID_CHARS',
                        'L2 close marker has invalid characters',
                        'warning',
                        true,
                        {
                            type: 'replace_line',
                            line: lineno,
                            content: indent + '// ' + makeL2Close(sectionName),
                        }
                    );
                    // Pop from stack if there's a matching open
                    if (l2Stack.length > 0) {
                        l2Stack.pop();
                        braceDepth = l2BraceDepthStack.length > 0 ? l2BraceDepthStack.pop()! : 0; parenScopeDepth = l2ParenDepthStack.length > 0 ? l2ParenDepthStack.pop()! : 0;
                    }
                    return;
                }

                // Detect malformed L2 open markers
                if (RE_L2_OPEN_LENIENT.test(raw)) {
                    const indent = raw.match(/^(\s*)/)?.[1] ?? '';
                    // Try to extract section name from malformed marker
                    // Look for a word surrounded by spaces (the proper format is " NAME ")
                    let nameMatch = raw.match(/ (\w+) /);
                    // If not found, try to find any word between ┌ and ┐
                    if (!nameMatch) {
                        nameMatch = raw.match(/┌.*?(\w+).*?┐/);
                    }
                    // If still not found, try to get the last word before ┐
                    if (!nameMatch) {
                        nameMatch = raw.match(/(\w+)\s*─*\s*┐/);
                    }
                    const sectionName = nameMatch?.[1] ?? 'NAME';
                    const indentNum = getIndentLevel(indent);

                    push(
                        lineno,
                        'L2_INVALID_CHARS',
                        'L2 section marker has invalid characters or formatting',
                        'warning',
                        true,
                        {
                            type            : 'replace_line',
                            line            : lineno,
                            content         : indent + '// ' + makeL2Open(sectionName),
                        }
                    );

                    // Push to stack so matching close marker can be found
                    l2Stack.push({ lineno, name: sectionName, indent, indentNum });
                    return;
                }

                // ── L3 open ─────────────────────────────────────────────────

                const m3o = RE_L3_OPEN.exec(raw);
                if (m3o) {
                    const [, indent, , title] = m3o;
                    const indentNum = getIndentLevel(indent);
                    const inner     = raw.trimStart().slice(3); // strip "// "
                    const correct   = makeL3Open(title);

                    // Close any unclosed L3 at same or higher indent
                    while (l3Stack.length > 0 && l3Stack[l3Stack.length - 1].indentNum >= indentNum) {
                        const unc = l3Stack.pop()!;
                        const closeContent = '\n\n' + unc.indent + '// ' + makeL3Close(unc.title);
                        push(
                            unc.lineno,
                            'L3_UNCLOSED',
                            `L3 section "${unc.title}" is never closed`,
                            'error',
                            true,
                            { type: 'insert_before_line', line: lineno, content: closeContent }
                        );
                    }

                    // Compute effective indent: inside L2 → l2.indentNum + 4 + braceDepth * 4;
                    // inside L1 only → l1.indentNum + 4 + braceDepth * 4
                    let effectiveIndent    = indent;
                    let effectiveIndentNum = indentNum;
                    if (l2Stack.length > 0) {
                        const l2 = l2Stack[l2Stack.length - 1];
                        effectiveIndentNum = l2.indentNum + 4 + braceDepth * 4;
                        effectiveIndent    = ' '.repeat(effectiveIndentNum);
                    } else if (l1Stack.length > 0) {
                        const l1 = l1Stack[l1Stack.length - 1];
                        effectiveIndentNum = l1.indentNum + 4 + braceDepth * 4;
                        effectiveIndent    = ' '.repeat(effectiveIndentNum);
                    }

                    // Check 2 blank lines before L3 when preceded by another L3 close
                    let isFirstL3InContext = true;
                    for (let i = idx - 1; i >= 0; i--) {
                        if (lines[i].trim().length === 0) continue;
                        if (RE_L3_CLOSE.test(lines[i])) { isFirstL3InContext = false; }
                        break;
                    }

                    if (!isFirstL3InContext) {
                        let blankCount = 0;
                        for (let i = idx - 1; i >= 0 && lines[i].trim().length === 0; i--) blankCount++;
                        if (blankCount !== 2) {
                            if (blankCount < 2) {
                                push(idx + 1, 'L3_BLANK_BEFORE',
                                `L3 section "${title}" must be preceded by 2 blank lines (has ${blankCount})`,
                                'warning', true,
                                { type: 'insert_before_line', line: idx + 1, content: '\n'.repeat(2 - blankCount) });
                            } else {
                                push(idx + 1, 'L3_BLANK_BEFORE',
                                `L3 section "${title}" must be preceded by 2 blank lines (has ${blankCount})`,
                                'warning', true,
                                { type: 'remove_blank_lines', line: idx + 1, count: blankCount - 2 });
                            }
                        }
                    }

                    // Enforce indent first (takes priority - width fix reuses effectiveIndent)
                    if (indentNum !== effectiveIndentNum) {
                        push(lineno, 'L3_INDENT',
                        `L3 section "${title}" must be indented by ${effectiveIndentNum} spaces (currently ${indentNum})`,
                        'warning', true,
                        { type: 'replace_line', line: lineno, content: effectiveIndent + '// ' + correct });
                    } else if (inner !== correct) {
                        // Check width only when indent is already correct
                        push(lineno, 'L3_WIDTH',
                        `L3 section "${title}" has wrong width/format`,
                        'warning', true,
                        { type: 'replace_line', line: lineno, content: effectiveIndent + '// ' + correct });
                    }

                    l3Stack.push({ lineno, title, name: title, indent: effectiveIndent, indentNum: effectiveIndentNum });
                    l3BraceDepthStack.push(braceDepth); l3ParenDepthStack.push(parenScopeDepth); // Save parent depth
                    braceDepth = 0; parenScopeDepth = 0; // Reset for L3 content
                    return;
                }

                // ── L3 close ────────────────────────────────────────────────

                const m3c = RE_L3_CLOSE.exec(raw);
                if (m3c) {
                    if (l3Stack.length === 0) {
                        push(lineno, 'L3_UNMATCHED_CLOSE',
                        'L3 close marker with no matching open',
                        'error', false);
                    } else {
                        const opened  = l3Stack.pop()!;
                        const correct = makeL3Close(opened.title);
                        const expectedLine = opened.indent + '// ' + correct;
                        if (raw !== expectedLine) {
                            push(lineno, 'L3_CLOSE_WIDTH',
                            `L3 close for "${opened.title}" has wrong width or indentation`,
                            'warning', true,
                            {
                                type            : 'replace_line',
                                line            : lineno,
                                content         : expectedLine,
                            });
                        }
                        // Restore parent brace depth
                        braceDepth = l3BraceDepthStack.length > 0 ? l3BraceDepthStack.pop()! : 0; parenScopeDepth = l3ParenDepthStack.length > 0 ? l3ParenDepthStack.pop()! : 0;
                    }
                    return;
                }

                // Lenient L3 open detection (malformed)
                if (RE_L3_OPEN_LENIENT.test(raw) && !RE_L3_CLOSE_LENIENT.test(raw)) {
                    // Has "// ╭" but didn't match the proper open (must have title)
                    const indent = raw.match(/^(\s*)/)?.[1] ?? '';
                    // Try to extract title: text between "── " and " ──"
                    const titleMatch = raw.match(/── (.+?) ─/);
                    const title = titleMatch?.[1]?.trim() || 'Section';

                    // Compute effective indent
                    let effectiveIndent    = indent;
                    let effectiveIndentNum = getIndentLevel(indent);
                    if (l2Stack.length > 0) {
                        const l2 = l2Stack[l2Stack.length - 1];
                        effectiveIndentNum = l2.indentNum + 4 + braceDepth * 4;
                        effectiveIndent    = ' '.repeat(effectiveIndentNum);
                    } else if (l1Stack.length > 0) {
                        const l1 = l1Stack[l1Stack.length - 1];
                        effectiveIndentNum = l1.indentNum + 4 + braceDepth * 4;
                        effectiveIndent    = ' '.repeat(effectiveIndentNum);
                    }

                    push(lineno, 'L3_INVALID',
                    'L3 section marker has invalid formatting',
                    'warning', true,
                    {
                        type            : 'replace_line',
                        line            : lineno,
                        content         : effectiveIndent + '// ' + makeL3Open(title)
                    });

                    l3Stack.push({ lineno, title, name: title, indent: effectiveIndent, indentNum: effectiveIndentNum });
                    l3BraceDepthStack.push(braceDepth); l3ParenDepthStack.push(parenScopeDepth); // Save parent depth
                    braceDepth = 0; parenScopeDepth = 0; // Reset for L3 content
                    return;
                }

                // Lenient L3 close detection (malformed)
                if (RE_L3_CLOSE_LENIENT.test(raw)) {
                    const opened = l3Stack.length > 0 ? l3Stack[l3Stack.length - 1] : null;
                    const title  = opened?.title ?? 'Section';
                    const expectedIndent = opened?.indent ?? (raw.match(/^(\s*)/)?.[1] ?? '');

                    push(lineno, 'L3_INVALID',
                    'L3 close marker has invalid formatting',
                    'warning', true,
                    {
                        type            : 'replace_line',
                        line            : lineno,
                        content         : expectedIndent + '// ' + makeL3Close(title)
                    });

                    if (l3Stack.length > 0) {
                        l3Stack.pop();
                        braceDepth = l3BraceDepthStack.length > 0 ? l3BraceDepthStack.pop()! : 0; parenScopeDepth = l3ParenDepthStack.length > 0 ? l3ParenDepthStack.pop()! : 0;
                    }
                    return;
                }

                // ── Titled-line separator detection ─────────────────────────

                const mTitledLine = RE_TITLED_LINE.exec(raw);
                if (mTitledLine) {
                    const [, indent, , title] = mTitledLine;
                    const inner     = raw.trimStart().slice(3); // strip "// "
                    const correct   = makeTitledLine(title);

                    if (inner !== correct) {
                        push(lineno, 'TITLED_LINE_MALFORMED',
                        `Titled-line separator format is incorrect (should be "${correct}")`,
                        'warning', true,
                        {
                            type            : 'replace_line',
                            line            : lineno,
                            content         : indent + '// ' + correct,
                        });
                    }
                    return;
                }

                // Lenient titled-line detection (malformed but close)
                if (RE_TITLED_LINE_LENIENT.test(raw)) {
                    // Has "// ── " pattern - try to extract title and reformat
                    const indent = raw.match(/^(\s*)/)?.[1] ?? '';
                    const titleMatch = raw.match(/── (.+?)(?:\s+─|$)/);
                    const title = titleMatch?.[1]?.trim() || 'title';

                    push(lineno, 'TITLED_LINE_MALFORMED',
                    `Titled-line separator format is incorrect`,
                    'warning', true,
                    {
                        type            : 'replace_line',
                        line            : lineno,
                        content         : indent + '// ' + makeTitledLine(title),
                    });
                    return;
                }

                // ── Indentation check ───────────────────────────────────────

                // Check if line is inside a section and has proper indentation
                if ((l1Stack.length > 0 || l2Stack.length > 0 || l3Stack.length > 0) && raw.trim().length > 0) {
                    const lineIndent = getIndentLevel(raw);
                    const targetSection =
                    l3Stack.length > 0
                    ? l3Stack[l3Stack.length - 1]
                    : l2Stack.length > 0 ? l2Stack[l2Stack.length - 1] : l1Stack[l1Stack.length - 1];
                    const trimmedLine = raw.trim();

                    // Strip string literals and comments before any bracket/paren analysis
                    // so that e.g. `'    fn('` or `'        });'` in string arguments
                    // don't inflate or deflate braceDepth / parenScopeDepth.
                    const stripped = stripStringsAndComments(trimmedLine);

                    // Expected indentation: section indent + 4 (minimum) + 4 per nesting level.
                    //
                    // braceDepth      - { [ } ] scope depth (string-stripped).
                    // parenScopeDepth - multi-line (…) scope depth. Opens when a line ends
                    //   with `(` (value-producing call). Closes when a subsequent line has
                    //   more `)` chars than `(` (excess close), handling the case where
                    //   the matching `)` appears in the middle of a continuation line.

                    const isFunctionDecl   = /\bfunction[\s*]\s*[\w<>]*\s*\($/.test(stripped);
                    const opensParenScope  = /\($/.test(stripped) && !isFunctionDecl;

                    const totalDepth = braceDepth + parenScopeDepth;

                    // Count leading closing tokens on this line (reduce depth BEFORE indent check).
                    // Only count ) when a multi-line paren scope is actually open.
                    let preCloseCount = 0;
                    for (const ch of stripped) {
                        if (ch === '}' || ch === ']') {
                            preCloseCount++;
                        } else if (ch === ')' && parenScopeDepth > 0 && preCloseCount === 0) {
                            preCloseCount++;
                            break;
                        } else if (ch !== ' ') {
                            break;
                        }
                    }
                    const depthForIndent = Math.max(0, totalDepth - preCloseCount);
                    const requiredIndent = targetSection.indentNum + 4 + depthForIndent * 4;

                    // Enforce exact indentation within sections
                    if (lineIndent !== requiredIndent) {
                        const fixedLine = ' '.repeat(requiredIndent) + trimmedLine;
                        push(
                            lineno,
                            'SECTION_INDENT',
                            `Content inside section "${targetSection.name}" must be indented by ${requiredIndent} spaces (currently ${lineIndent})`,
                            'warning',
                            true,
                            {
                                type        : 'replace_line',
                                line        : lineno,
                                content     : fixedLine
                            }
                        );
                    }

                    // Update depth counters using the stripped line so that bracket/paren
                    // characters inside string literals don't affect future lines.
                    for (const char of stripped) {
                        if (char === '{' || char === '[') braceDepth++;
                        else if (char === '}' || char === ']') braceDepth = Math.max(0, braceDepth - 1);
                    }
                    if (opensParenScope) parenScopeDepth++;
                    // Excess close: if this line has more ) than (, the excess closes
                    // multi-line paren scopes (handles inline ) not at line start).
                    let parenOpens = 0, parenCloses = 0;
                    for (const ch of stripped) {
                        if (ch === '(') parenOpens++;
                        else if (ch === ')') parenCloses++;
                    }
                    const excessClose = Math.max(0, parenCloses - parenOpens);
                    if (excessClose > 0) parenScopeDepth = Math.max(0, parenScopeDepth - excessClose);
                }
            });

            // ── Blank line check between section markers and content ────

            // Track sections: open line → find corresponding close line
            const sectionMarkers = new Map<number, { name: string; indent: string; type: 'L1' | 'L2' | 'L3' }>();
            lines.forEach((raw, idx) => {
                const m1o = RE_L1_OPEN.exec(raw);
                const m2o = RE_L2_OPEN.exec(raw);
                const m3o = RE_L3_OPEN.exec(raw);
                if (m1o) {
                    const [, indent, , , name] = m1o;
                    sectionMarkers.set(idx, { name, indent, type: 'L1' });
                }
                if (m2o) {
                    const [, indent, , , name] = m2o;
                    sectionMarkers.set(idx, { name, indent, type: 'L2' });
                }
                if (m3o) {
                    const [, indent, , title] = m3o;
                    sectionMarkers.set(idx, { name: title, indent, type: 'L3' });
                }
            });

            // Check for empty sections (open immediately followed by close)
            sectionMarkers.forEach((marker, openIdx) => {
                // Find the MATCHING close by tracking depth - skip closes consumed by
                // nested opens of the same type so MAIN's open doesn't pair with PACK's close.
                let closeIdx = -1;
                let depth = 0;
                for (let i = openIdx + 1; i < lines.length; i++) {
                    if (marker.type === 'L1') {
                        if (RE_L1_OPEN.test(lines[i]))  { depth++; continue; }
                        if (RE_L1_CLOSE.test(lines[i])) {
                            if (depth > 0) { depth--; continue; }
                            closeIdx = i; break;
                        }
                    }
                    if (marker.type === 'L2') {
                        if (RE_L2_OPEN.test(lines[i]))  { depth++; continue; }
                        if (RE_L2_CLOSE.test(lines[i])) {
                            if (depth > 0) { depth--; continue; }
                            closeIdx = i; break;
                        }
                    }
                    if (marker.type === 'L3') {
                        if (RE_L3_OPEN.test(lines[i]))  { depth++; continue; }
                        if (RE_L3_CLOSE.test(lines[i])) {
                            if (depth > 0) { depth--; continue; }
                            closeIdx = i; break;
                        }
                    }
                }

                if (closeIdx === -1) return; // No matching close

                // Check if section is empty (only blank lines between open and close)
                let hasContent = false;
                for (let i = openIdx + 1; i < closeIdx; i++) {
                    if (
                        lines[i].trim().length > 0 &&
                        !RE_L1_OPEN.test(lines[i]) &&
                        !RE_L2_OPEN.test(lines[i]) &&
                        !RE_L3_OPEN.test(lines[i])
                    ) {
                        hasContent = true;
                        break;
                    }
                }

                // Empty section: must have at least one blank line between markers
                if (!hasContent) {
                    let hasBlank = false;
                    for (let i = openIdx + 1; i < closeIdx; i++) {
                        if (lines[i].trim().length === 0) {
                            hasBlank = true;
                            break;
                        }
                    }
                    if (!hasBlank) {
                        push(
                            openIdx + 1,
                            'SECTION_EMPTY_NO_BLANK',
                            `Empty section must have at least 1 blank line between markers`,
                            'warning',
                            true,
                            { type: 'insert_after_line', line: openIdx + 1, content: '' }
                        );
                    }
                }
                // Non-empty sections: blank lines before first content and after last content
                else {
                    let firstContentIdx = -1;
                    let lastContentIdx = -1;
                    // For firstContentIdx: treat all non-blank lines as content (including
                    // nested open markers, which are the leading edge of a sub-section).
                    // For lastContentIdx: also treat all non-blank lines as content, BUT
                    // skip pure trailing close markers - a nested close marker sitting
                    // immediately before the parent close marker is governed by its own
                    // spacing rule and should not anchor lastContentIdx, as that would make
                    // the blank-before-parent-close check fire when the blank already exists
                    // between the real last content line and the nested close marker.
                    for (let i = openIdx + 1; i < closeIdx; i++) {
                        if (lines[i].trim().length > 0) {
                            if (firstContentIdx === -1) firstContentIdx = i;
                            lastContentIdx = i;
                        }
                    }
                    // Walk lastContentIdx backward past any trailing close-only markers so
                    // that a nested `// └─...─┘` sitting between real content and the parent
                    // close marker is not mistaken for "the last content line has no blank
                    // before the parent close". Also skip lone `}` / `]` lines that act as
                    // block closers wrapping nested sections (they get their own blank check).
                    const isCloseMarkerLine = (l: string): boolean =>
                    RE_L1_CLOSE.test(l) || RE_L2_CLOSE.test(l) || RE_L3_CLOSE.test(l);
                    const isBlockCloserLine = (l: string): boolean =>
                    /^\s*[}\]]\s*$/.test(l);
                    while (
                        lastContentIdx > (firstContentIdx ?? -1) &&
                        (isCloseMarkerLine(lines[lastContentIdx] ?? '') || isBlockCloserLine(lines[lastContentIdx] ?? ''))
                    ) {
                        lastContentIdx--;
                        // skip blanks too while walking back
                        while (
                            lastContentIdx > (firstContentIdx ?? -1) &&
                            lines[lastContentIdx]?.trim() === ''
                        ) lastContentIdx--;
                    }

                    if (firstContentIdx !== -1) {
                        // Check blank line after open (before first content).
                        // Count only genuine blank lines between openIdx and firstContentIdx -
                        // skip nested section markers that may sit in between (same reasoning
                        // as blanksBeforeClose below).
                        let blanksAfterOpen = 0;
                        for (let i = openIdx + 1; i < firstContentIdx; i++) {
                            if (lines[i].trim().length === 0) blanksAfterOpen++;
                            // non-blank marker lines (e.g. nested L2/L3 open/close) are not counted
                        }

                        if (blanksAfterOpen === 0) {
                            push(
                                openIdx + 1,
                                'SECTION_BLANK_AFTER_OPEN',
                                `Must have blank line after section open`,
                                'warning',
                                true,
                                { type: 'insert_after_line', line: openIdx + 1, content: '' }
                            );
                        } else if (blanksAfterOpen > 1) {
                            push(
                                firstContentIdx + 1,
                                'SECTION_EXCESS_BLANK_AFTER_OPEN',
                                `Only 1 blank line allowed after section open (has ${blanksAfterOpen}, remove ${blanksAfterOpen - 1})`,
                                'warning',
                                true,
                                { type: 'remove_blank_lines', line: firstContentIdx + 1, count: blanksAfterOpen - 1 }
                            );
                        }

                        // Check blank line directly before close marker.
                        // Count only the blank lines immediately above closeIdx -
                        // stop as soon as a non-blank line is encountered (whether
                        // it is a nested close marker, content, or an open marker).
                        // This ensures that when the last item in a section is a
                        // nested sub-section, there is still a blank line between
                        // the nested close marker and the parent close marker.
                        //
                        // Additionally, if the line immediately above the close is a lone
                        // block closer (`}` / `]`), count the blanks above THAT line too -
                        // the block closer needs its own blank before it.
                        let blanksBeforeClose = 0;
                        {
                            let i = closeIdx - 1;
                            while (i >= 0 && lines[i]?.trim() === '') {
                                blanksBeforeClose++;
                                i--;
                            }
                            // If the non-blank line above the section close is a lone block closer,
                            // the enforced blank goes before that block closer, not before the
                            // section close itself. Check that the block closer has a blank before it.
                            if (i >= 0 && isBlockCloserLine(lines[i] ?? '')) {
                                // blanksBeforeClose so far is between the block closer and section close.
                                // We need to enforce a blank both here AND before the block closer.
                                // Reset count to check the gap before the block closer.
                                const blockCloserIdx = i;
                                let blanksBeforeBlockCloser = 0;
                                i--;
                                while (i >= 0 && lines[i]?.trim() === '') {
                                    blanksBeforeBlockCloser++;
                                    i--;
                                }
                                // Enforce blank before the block closer only when the matching
                                // opener also has a blank after it. If the opener has no blank
                                // after it, the user chose the "no padding" style - respect it.
                                if (blanksBeforeBlockCloser === 0) {
                                    // Find the opener line that corresponds to this block closer.
                                    // Walk upward from blockCloserIdx tracking brace depth.
                                    let openerHasBlank = false;
                                    {
                                        let depth = 0;
                                        for (let bi = blockCloserIdx; bi >= openIdx + 1; bi--) {
                                            const bl = lines[bi] ?? '';
                                            for (let k = bl.length - 1; k >= 0; k--) {
                                                if (bl[k] === '}' || bl[k] === ']') depth++;
                                                else if (bl[k] === '{' || bl[k] === '[') {
                                                    depth--;
                                                    if (depth <= 0) {
                                                        // bi is the opener line; check the line after it
                                                        openerHasBlank = (lines[bi + 1] ?? '').trim() === '';
                                                        bi = -1; // break outer loop
                                                        break;
                                                    }
                                                }
                                            }
                                            if (bi === -1) break;
                                        }
                                    }
                                    if (openerHasBlank) {
                                        push(
                                            blockCloserIdx,
                                            'BLOCK_CLOSER_BLANK_BEFORE',
                                            `Must have blank line before closing brace/bracket`,
                                            'warning',
                                            true,
                                            { type: 'insert_before_line', line: blockCloserIdx + 1, content: '' }
                                        );
                                    }
                                } else if (blanksBeforeBlockCloser > 1) {
                                    push(
                                        blockCloserIdx + 1,
                                        'BLOCK_CLOSER_EXCESS_BLANK_BEFORE',
                                        `Only 1 blank line allowed before closing brace (has ${blanksBeforeBlockCloser})`,
                                        'warning',
                                        true,
                                        { type: 'remove_blank_lines', line: blockCloserIdx + 1, count: blanksBeforeBlockCloser - 1 }
                                    );
                                }
                                // For the parent section close check, use blanksBeforeClose
                                // (the gap between block closer and section close) as normal.
                            }
                        }

                        if (blanksBeforeClose === 0) {
                            push(
                                closeIdx,
                                'SECTION_BLANK_BEFORE_CLOSE',
                                `Must have blank line before section close`,
                                'warning',
                                true,
                                {
                                    type            : 'insert_after_line',
                                    line            : closeIdx,
                                    content         : ''
                                }
                            );
                        } else if (blanksBeforeClose > 1) {
                            push(
                                closeIdx + 1,
                                'SECTION_EXCESS_BLANK_BEFORE_CLOSE',
                                `Only 1 blank line allowed before section close (has ${blanksBeforeClose}, remove ${blanksBeforeClose - 1})`,
                                'warning',
                                true,
                                {
                                    type        : 'remove_blank_lines',
                                    line        : closeIdx + 1,
                                    count       : blanksBeforeClose - 1
                                }
                            );
                        }
                    }
                }
            });

            // ── Blank line between surrounding code and section markers ─
            //
            // Ensures a blank line exists:
            //   1. Between a preceding non-blank code line (e.g. `{`) and a section open marker
            //   2. Between a section close marker and a following non-blank code line (e.g. `}`)
            //
            // This handles cases like:
            //   export class Foo {
            //       // ┌── INIT ──┐     ← needs blank before
            //   }                       ← needs blank before this `}`

            lines.forEach((raw, idx) => {
                // const isAnyOpen  = RE_L1_OPEN.test(raw)  || RE_L2_OPEN.test(raw);
                const isAnyClose = RE_L1_CLOSE.test(raw) || RE_L2_CLOSE.test(raw) || RE_L3_CLOSE.test(raw);

                // Rule 1: blank line required before an L2 section open marker when the
                // preceding non-blank line is not itself a section marker.
                // (L1 opens are already handled by the dedicated L1_BLANK_BEFORE check above.)
                const isL2Open = RE_L2_OPEN.test(raw);
                if (isL2Open && idx > 0) {
                    const prevIdx = idx - 1;
                    const prevLine = lines[prevIdx];
                    if (
                        prevLine.trim().length > 0 &&
                        !RE_L1_OPEN.test(prevLine)  &&
                        !RE_L1_CLOSE.test(prevLine) &&
                        !RE_L2_OPEN.test(prevLine)  &&
                        !RE_L2_CLOSE.test(prevLine)
                    ) {
                        const sectionName =
                        (RE_L1_OPEN.exec(raw) ?? RE_L2_OPEN.exec(raw))![4] ?? '';
                        push(
                            idx + 1,
                            'SECTION_BLANK_BEFORE_MARKER',
                            `Must have blank line before section open marker "${sectionName}"`,
                            'warning',
                            true,
                            {
                                type        : 'insert_after_line',
                                line        : prevIdx,
                                content     : ''
                            }
                        );
                    }
                }

                // Rule 1b: blank line required before an L3 open marker when the
                // preceding non-blank line is not itself a section marker.
                const isL3Open = RE_L3_OPEN.test(raw);
                if (isL3Open && idx > 0) {
                    const prevIdx = idx - 1;
                    const prevLine = lines[prevIdx];
                    if (
                        prevLine.trim().length > 0 &&
                        !RE_L1_OPEN.test(prevLine)  &&
                        !RE_L1_CLOSE.test(prevLine) &&
                        !RE_L2_OPEN.test(prevLine)  &&
                        !RE_L2_CLOSE.test(prevLine) &&
                        !RE_L3_OPEN.test(prevLine)  &&
                        !RE_L3_CLOSE.test(prevLine)
                    ) {
                        const m3 = RE_L3_OPEN.exec(raw);
                        const title = m3?.[3] ?? '';
                        push(
                            idx + 1,
                            'SECTION_BLANK_BEFORE_MARKER',
                            `Must have blank line before L3 section open marker "${title}"`,
                            'warning',
                            true,
                            {
                                type        : 'insert_after_line',
                                line        : prevIdx + 1,
                                content     : ''
                            }
                        );
                    }
                }

                // Rule 2: blank line required after a section close marker when the
                // following non-blank line is not itself a section marker.
                if (isAnyClose && idx + 1 < lines.length) {
                    const nextLine = lines[idx + 1];
                    if (
                        nextLine.trim().length > 0 &&
                        !RE_L1_OPEN.test(nextLine)  &&
                        !RE_L1_CLOSE.test(nextLine) &&
                        !RE_L2_OPEN.test(nextLine)  &&
                        !RE_L2_CLOSE.test(nextLine) &&
                        !RE_L3_OPEN.test(nextLine)  &&
                        !RE_L3_CLOSE.test(nextLine)
                    ) {
                        push(
                            idx + 1,
                            'SECTION_BLANK_AFTER_MARKER',
                            `Must have blank line after section close marker`,
                            'warning',
                            true,
                            {
                                type        : 'insert_after_line',
                                line        : idx + 1,  // 1-indexed: insert after line at idx (0-indexed)
                                content     : ''
                            }
                        );
                    }
                }
            });

            // Unclosed sections at EOF
            for (const unc of l1Stack)
            push(unc.lineno, 'L1_UNCLOSED', `L1 section "${unc.name}" is never closed`, 'error', true, {
                type: 'append_lines',
                content: '\n' + unc.indent + '// ' + makeL1Close(unc.name),
            });
            for (const unc of l2Stack)
            push(unc.lineno, 'L2_UNCLOSED', `L2 section "${unc.name}" is never closed`, 'error', true, {
                type: 'append_lines',
                content: unc.indent + '// ' + makeL2Close(unc.name),
            });
            for (const unc of l3Stack)
            push(unc.lineno, 'L3_UNCLOSED', `L3 section "${unc.title}" is never closed`, 'error', true, {
                type: 'append_lines',
                content: unc.indent + '// ' + makeL3Close(unc.title),
            });

            // ── Trailing whitespace ─────────────────────────────────────
            lines.forEach((raw, idx) => {
                if (/\s+$/.test(raw)) {
                    push(
                        idx + 1,
                        'TRAILING_SPACE',
                        'Line has trailing whitespace',
                        'warning',
                        true,
                        {
                            type        : 'replace_line',
                            line        : idx + 1,
                            content     : raw.replace(/\s+$/, '')
                        }
                    );
                }
            });

            // ── Excess consecutive blank lines ──────────────────────────
            //
            // Runs of 2 or more blank lines are collapsed to 1, UNLESS the run is
            // immediately adjacent to a section marker (L1/L2/L3 open or close) - those
            // runs are governed by their own dedicated blank-line rules (L1_BLANK_BEFORE,
            // L2_BLANK_BEFORE, L3_BLANK_BEFORE) and must not be double-reported here.
            //
            // "Adjacent" means the non-blank line directly before the run, or directly
            // after the run, is a section marker.
            {
                const isMarker = (line: string): boolean =>
                RE_L1_OPEN.test(line)  || RE_L1_CLOSE.test(line) ||
                RE_L2_OPEN.test(line)  || RE_L2_CLOSE.test(line) ||
                RE_L3_OPEN.test(line)  || RE_L3_CLOSE.test(line);

                let i = 0;
                while (i < lines.length) {
                    if (lines[i].trim().length !== 0) { i++; continue; }

                    // Found start of a blank-line run
                    const runStart = i;
                    while (i < lines.length && lines[i].trim().length === 0) i++;
                    const runEnd = i; // exclusive; lines[runEnd] is the first non-blank after the run
                    const runLength = runEnd - runStart;

                    if (runLength < 2) continue; // single blank - fine

                    // Check line before the run
                    const lineBefore = runStart > 0 ? lines[runStart - 1] : '';
                    // Check line after the run
                    const lineAfter  = runEnd < lines.length ? lines[runEnd] : '';

                    if (isMarker(lineBefore) || isMarker(lineAfter)) continue; // exempt

                    // Also exempt if there is no real code on either side of the run
                    // (e.g. the file consists entirely of blank lines, or the run sits at
                    // BOF/EOF with no non-blank neighbour). Nothing meaningful to clean up.
                    const hasCodeBefore = runStart > 0 && lineBefore.trim().length > 0;
                    const hasCodeAfter  = runEnd < lines.length && lineAfter.trim().length > 0;
                    if (!hasCodeBefore && !hasCodeAfter) continue;

                    // Excess blank lines: keep 1, remove the rest
                    const excess = runLength - 1;
                    push(
                        runEnd, // 1-indexed line number of the first non-blank after the run
                        'EXCESS_BLANK_LINES',
                        `${runLength} consecutive blank lines found; only 1 is allowed here (remove ${excess})`,
                        'warning',
                        true,
                        {
                            type        : 'remove_blank_lines',
                            line        : runEnd,
                            count       : excess
                        }
                    );
                }
            }

            // ── Block padding symmetry ──────────────────────────────────
            //
            // For every code block opener (a line whose stripped form ends with a net-open
            // `{` or `[`), the blank-line padding immediately inside must be symmetric:
            //
            //   opener {       opener {      opener {
            //                ← ok →                 ← WRONG: remove blank
            //       content          content
            //                                ← WRONG: remove this blank
            //   }              }             }
            //
            // Rule: blank present after opener ↔ blank present before closer.
            //
            // Exempt:
            //   - Empty blocks (no real content between opener and closer)
            //   - Section markers (L1/L2/L3) - governed by their own padding rules
            {
                // Net brace/bracket delta for a stripped line (+1 per { or [, -1 per } or ])
                const netDelta = (stripped: string): number => {
                    let d = 0;
                    for (const ch of stripped) {
                        if (ch === '{' || ch === '[') d++;
                        else if (ch === '}' || ch === ']') d--;
                    }
                    return d;
                };

                // True if the stripped line ends with a net-opening token ({ or [)
                const endsWithOpen = (stripped: string): boolean => {
                    const t = stripped.trimEnd();
                    return t.endsWith('{') || t.endsWith('[');
                };

                const isAnyMarker = (line: string): boolean =>
                RE_L1_OPEN.test(line)  || RE_L1_CLOSE.test(line) ||
                RE_L2_OPEN.test(line)  || RE_L2_CLOSE.test(line) ||
                RE_L3_OPEN.test(line)  || RE_L3_CLOSE.test(line);

                for (let openerIdx = 0; openerIdx < lines.length; openerIdx++) {
                    const openerRaw = lines[openerIdx];

                    // Skip blank lines and section markers
                    if (openerRaw.trim().length === 0) continue;
                    if (isAnyMarker(openerRaw)) continue;

                    const openerStripped = stripStringsAndComments(openerRaw.trimStart());

                    // Only lines that end with a net-opening brace/bracket
                    if (!endsWithOpen(openerStripped)) continue;
                    if (netDelta(openerStripped) <= 0) continue;

                    // Skip blocks whose opener itself is a control-flow statement
                    // (while/for/if/switch) - these are algorithmic and should not get
                    // extra blank padding inserted.
                    if (/^\s*(while|for|if|switch)\b/.test(openerStripped)) continue;

                    // Find the matching closer by tracking depth forward,
                    // skipping blank lines and section markers (they don't affect depth)
                    let depth = netDelta(openerStripped);
                    let closerIdx = -1;
                    for (let j = openerIdx + 1; j < lines.length; j++) {
                        const jRaw = lines[j];
                        if (jRaw.trim().length === 0) continue; // blank - skip
                        if (isAnyMarker(jRaw)) continue;        // marker - skip
                        depth += netDelta(stripStringsAndComments(jRaw.trimStart()));
                        if (depth <= 0) {
                            closerIdx = j;
                            break;
                        }
                    }

                    if (closerIdx === -1) continue; // no matching closer found
                    if (closerIdx === openerIdx) continue; // same-line block (guard)

                    // Empty block: no real non-marker content between opener and closer
                    let hasContent = false;
                    for (let k = openerIdx + 1; k < closerIdx; k++) {
                        if (lines[k].trim().length > 0 && !isAnyMarker(lines[k])) {
                            hasContent = true;
                            break;
                        }
                    }
                    if (!hasContent) continue;

                    // Skip small algorithmic blocks that start with control-flow statements.
                    let firstContentLine = '';
                    for (let k = openerIdx + 1; k < closerIdx; k++) {
                        if (lines[k].trim().length > 0 && !isAnyMarker(lines[k])) { firstContentLine = lines[k]; break; }
                    }
                    if (/^\s*(while|for|if|switch)\b/.test(firstContentLine)) continue;

                    // If this block contains ANY section markers, skip block padding enforcement
                    // because markers have their own dedicated blank-line rules
                    // (SECTION_BLANK_BEFORE_MARKER, SECTION_BLANK_AFTER_MARKER, etc.)
                    // and their blank-line behavior should not be overridden by block padding logic.
                    //
                    // NOTE: This check must look at ALL lines, not just non-blank lines,
                    // because the blank line that separates the marker from what comes before/after
                    // is controlled by marker-specific rules, not block padding logic.
                    let containsMarker = false;
                    for (let k = openerIdx + 1; k < closerIdx; k++) {
                        if (isAnyMarker(lines[k])) {
                            containsMarker = true;
                            break;
                        }
                    }
                    if (containsMarker) continue;

                    // Determine padding symmetry: is there a literal blank line immediately
                    // after the opener, and immediately before the closer?
                    const blankAfterOpen  = openerIdx + 1 < closerIdx && (lines[openerIdx + 1] ?? '').trim() === '';
                    const blankBeforeClose = closerIdx - 1 > openerIdx && (lines[closerIdx - 1] ?? '').trim() === '';

                    // For the asymmetry fix we still need realPrevIdx (the last real content
                    // line, excluding trailing markers and blanks) to know where to insert.
                    let realPrevIdx = closerIdx - 1;
                    while (
                        realPrevIdx > openerIdx &&
                        (isAnyMarker(lines[realPrevIdx] ?? '') || lines[realPrevIdx]?.trim() === '')
                    ) {
                        realPrevIdx--;
                    }

                    if (blankAfterOpen === blankBeforeClose) {
                        // symmetric - preserve the user's chosen style exactly.
                        continue;
                    }

                    if (blankAfterOpen && !blankBeforeClose) {
                        // Opener padded, closer not → insert blank immediately before the
                        // closer (between lines[closerIdx-1] and lines[closerIdx]).
                        // insert_after_line splices at index `line`, so `line: closerIdx`
                        // inserts before lines[closerIdx] (the closer).
                        push(
                            closerIdx,
                            'BLOCK_PADDING_ASYMMETRIC',
                            `Block has blank line after opener but not before closer - add blank before closer`,
                            'warning',
                            true,
                            {
                                type        : 'insert_after_line',
                                line        : closerIdx,
                                content     : ''
                            }
                        );
                    } else {
                        // Closer padded, opener not → remove the blank before closer
                        // to match the user's no-padding style.
                        push(
                            openerIdx + 1,
                            'BLOCK_PADDING_ASYMMETRIC',
                            `Block has blank line before closer but not after opener - remove blank before closer`,
                            'warning',
                            true,
                            {
                                type        : 'remove_blank_lines',
                                line        : closerIdx + 1,
                                count       : 1
                            }
                        );
                    }
                }
            }

            return issues;
        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌───────────────────────────────── FIX ──────────────────────────────┐

        // Apply all fixable issues to a file's content and return the corrected string
        export function applyFixes(content: string, issues: FormatIssue[]): string {
            let result = content;

            // Deduplicate blank-insertion fixes: if multiple insert_after_line or
            // insert_before_line fixes target the same location with empty content,
            // keep only one per location to avoid duplicate blanks.
            {
                const dedupMap = new Map<string, boolean>(); // key: "line|type", value: true if seen
                const deduped = new Set<FormatIssue>();

                for (const issue of issues) {
                    if (issue.fix?.type === 'insert_after_line' || issue.fix?.type === 'insert_before_line') {
                        const fix = issue.fix as { line: number };
                        const content = (issue.fix as { content: string }).content;
                        if (content === '') {
                            const key = `${fix.line}|${issue.fix.type}`;
                            if (!dedupMap.has(key)) {
                                dedupMap.set(key, true);
                                deduped.add(issue);
                            }
                            continue; // Don't add duplicate blank insertions
                        }
                    }
                    deduped.add(issue);
                }

                // Replace issues with deduplicated set
                issues = Array.from(deduped);
            }

            // ── Line replacement fixes (applied first, before anything shifts line numbers) ─
            const fixMap = new Map<number, string>();
            for (const issue of issues) {
                if (issue.fix?.type === 'replace_line') {
                    const lineNo = (issue.fix as { line: number }).line;
                    const content = (issue.fix as { content: string }).content;
                    const existing = fixMap.get(lineNo);
                    // If multiple replace_line fixes target the same line, prefer the
                    // more substantial replacement (longer content). This prevents
                    // simple trailing-space fixes from overwriting indentation/formatting
                    // replacements.
                    if (!existing || content.length > existing.length) {
                        fixMap.set(lineNo, content);
                    }
                }
            }

            if (fixMap.size > 0) {
                const lines = result.split('\n');
                fixMap.forEach((replacement, lineno) => {
                    lines[lineno - 1] = replacement;
                });
                result = lines.join('\n');
            }

            // ── Range replacement fixes (replace_lines: header restructure) ─
            // Applied after single-line replacements but before insertions, sorted descending
            // so earlier ranges don't shift the indices of later ones.
            const rangeFixes = issues
            .filter((i) => i.fix?.type === 'replace_lines')
            .sort((a, b) => {
                const af = a.fix as { startLine: number };
                const bf = b.fix as { startLine: number };
                return bf.startLine - af.startLine;
            });

            if (rangeFixes.length > 0) {
                const lines = result.split('\n');
                for (const issue of rangeFixes) {
                    const f = issue.fix as { startLine: number; endLine: number; content: string };
                    const newLines = f.content.split('\n');
                    // splice is 0-indexed; startLine/endLine are 1-indexed inclusive
                    lines.splice(f.startLine - 1, f.endLine - f.startLine + 1, ...newLines);
                }
                result = lines.join('\n');
            }

            // ── Prepend fixes (HEADER_MISSING only) ─────────────────────
            // HEADER_WRONG_PATH and HEADER_WRONG_AUTHOR now use replace_line / insert_after_line,
            // so this branch only fires when there is no "//" header block at all.
            let prependedLines = 0;
            const prepends = issues.filter((i) => i.fix?.type === 'prepend_lines');
            if (prepends.length > 0) {
                const rawLines = result.split('\n');

                // Determine where to insert: after shebang + any leading block comments/blanks
                let startIdx = 0;
                if (rawLines[0]?.startsWith('#!')) {
                    startIdx = 1;
                    if (rawLines[1]?.trim() === '') startIdx = 2;
                }
                while (startIdx < rawLines.length) {
                    const l = rawLines[startIdx] ?? '';
                    if (l.trimStart().startsWith('/*') || l.trimStart().startsWith('*') || l.trim() === '') {
                        startIdx++;
                    } else {
                        break;
                    }
                }

                const fixContent = (prepends[0].fix as { content: string }).content.trimEnd();
                const fixLines = fixContent.split('\n').filter((l) => !l.startsWith('#!'));
                prependedLines = fixLines.length;
                rawLines.splice(startIdx, 0, ...fixLines);
                result = rawLines.join('\n');
            }

            // ── Remove blank lines fixes (must run before inserts to use original line numbers) ─
            const removeBlanksFixes = issues.filter((i) => i.fix?.type === 'remove_blank_lines');
            if (removeBlanksFixes.length > 0) {
                const lines = result.split('\n');
                // Sort by line number in descending order to avoid index shifting
                removeBlanksFixes.sort(
                    (a, b) => (b.fix as { line: number }).line - (a.fix as { line: number }).line
                );

                for (const issue of removeBlanksFixes) {
                    const line = (issue.fix as { line: number }).line + prependedLines;
                    const count = (issue.fix as { count: number }).count;
                    // Remove 'count' blank lines immediately before 'line'
                    // Line numbers are 1-indexed, array indices are 0-indexed
                    const startIdx = line - 1 - count;
                    if (startIdx >= 0) {
                        lines.splice(startIdx, count);
                    }
                }
                result = lines.join('\n');
            }

            // ── Insert blank line fixes (adjusting for prepended lines) ─
            // Track indices where we've inserted a blank so we can avoid
            // creating adjacent duplicate blank lines from separate fixes.
            const insertedBlankIndices = new Set<number>();

            const insertFixes = issues.filter((i) => i.fix?.type === 'insert_after_line');
            if (insertFixes.length > 0) {
                const lines = result.split('\n');
                // Sort by line number in descending order to avoid index shifting
                insertFixes.sort(
                    (a, b) => (b.fix as { line: number }).line - (a.fix as { line: number }).line
                );

                for (const issue of insertFixes) {
                    const afterLine = (issue.fix as { line: number }).line + prependedLines;
                    const content = (issue.fix as { content: string }).content;
                    // Insert AFTER the line (at index afterLine)
                    if (content === '') {
                        // Skip if there's already a blank at the target index or if
                        // a neighboring insertion already created a blank adjacent to it.
                        if (lines[afterLine] === '' || insertedBlankIndices.has(afterLine) || insertedBlankIndices.has(afterLine - 1)) continue;
                        lines.splice(afterLine, 0, content);
                        insertedBlankIndices.add(afterLine);
                    } else {
                        lines.splice(afterLine, 0, content);
                    }
                }
                result = lines.join('\n');
            }

            // ── Insert before line fixes (blank lines before sections, adjusting for prepended lines) ─
            const insertBeforeFixes = issues.filter((i) => i.fix?.type === 'insert_before_line');
            if (insertBeforeFixes.length > 0) {
                const lines = result.split('\n');
                // Sort by line number in descending order to avoid index shifting
                insertBeforeFixes.sort(
                    (a, b) => (b.fix as { line: number }).line - (a.fix as { line: number }).line
                );

                for (const issue of insertBeforeFixes) {
                    const beforeLine = (issue.fix as { line: number }).line + prependedLines;
                    const content = (issue.fix as { content: string }).content;
                    // Insert BEFORE the line (at index beforeLine - 1)
                    if (content === '') {
                        const insertIdx = beforeLine - 1;
                        if (lines[insertIdx] === '' || insertedBlankIndices.has(insertIdx) || insertedBlankIndices.has(insertIdx + 1)) continue;
                        lines.splice(insertIdx, 0, content);
                        insertedBlankIndices.add(insertIdx);
                    } else {
                        lines.splice(beforeLine - 1, 0, content);
                    }
                }
                result = lines.join('\n');
            }

            // ── Append fixes (unclosed sections at EOF) ─────────────────
            const appends = issues.filter((i) => i.fix?.type === 'append_lines');
            if (appends.length > 0) {
                const appendContent = appends.map((i) => (i.fix as { content: string }).content).join('\n');
                result = result.endsWith('\n') ? result + appendContent : result + '\n' + appendContent;
            }

            // Final cleanup: collapse excess consecutive blank lines to a single
            // blank, except when the run is adjacent to a section marker. This
            // mirrors the parser's rule for excess blank lines and prevents
            // duplicate blank insertions from creating unwanted spacing.
            {
                const lines = result.split('\n');
                const isMarker = (line: string): boolean =>
                RE_L1_OPEN.test(line)  || RE_L1_CLOSE.test(line) ||
                RE_L2_OPEN.test(line)  || RE_L2_CLOSE.test(line) ||
                RE_L3_OPEN.test(line)  || RE_L3_CLOSE.test(line);

                let i = 0;
                while (i < lines.length) {
                    if (lines[i].trim().length !== 0) { i++; continue; }

                    const runStart = i;
                    while (i < lines.length && lines[i].trim().length === 0) i++;
                    const runEnd = i; // exclusive
                    const runLength = runEnd - runStart;

                    if (runLength < 2) continue; // single blank - fine

                    const lineBefore = runStart > 0 ? lines[runStart - 1] : '';
                    const lineAfter  = runEnd < lines.length ? lines[runEnd] : '';

                    if (isMarker(lineBefore) || isMarker(lineAfter)) continue; // exempt

                    // Also exempt if there is no real code on either side of the run
                    const hasCodeBefore = runStart > 0 && lineBefore.trim().length > 0;
                    const hasCodeAfter  = runEnd < lines.length && lineAfter.trim().length > 0;
                    if (!hasCodeBefore && !hasCodeAfter) continue;

                    // Remove excess blanks (keep 1)
                    const excess = runLength - 1;
                    lines.splice(runStart + 1, excess);
                    i = runStart + 1; // continue after the single blank
                }
                result = lines.join('\n');
            }

            return result;
        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌─────────────────────────────── RUNNER ─────────────────────────────┐

        // Scan all .ts files in src/ and return every issue found across all files
        export async function runFormatCheck(srcDir = 'src'): Promise<FormatIssue[]> {
            // Only ignore *.test.ts files when checking the src directory
            // When checking test/ or bench/ directories, include all .ts files except .d.ts
            const ignorePatterns = ['**/*.d.ts'];
            if (srcDir === 'src') {
                ignorePatterns.push('**/*.test.ts');
            }

            const files = await glob('**/*.ts', {
                cwd: srcDir,
                absolute: true,
                ignore: ignorePatterns,
            });

            const all: FormatIssue[] = [];
            for (const filepath of files.sort()) {
                const content = readFile(filepath);
                // Header check uses the srcDir as the root for the relative path
                const headerIss = checkFileHeader(filepath, srcDir, content);
                const bodyIss = parseFile(filepath, content);
                all.push(...headerIss, ...bodyIss);
            }
            return all;
        }

        // Apply all fixes to all affected files - writes changes to disk
        export async function applyFormatFixes(issues: FormatIssue[]): Promise<Map<string, number>> {
            // Group fixable issues by file
            const byFile = new Map<string, FormatIssue[]>();
            for (const issue of issues) {
                if (!issue.fixable || !issue.fix) continue;
                if (!byFile.has(issue.file)) byFile.set(issue.file, []);
                byFile.get(issue.file)!.push(issue);
            }

            const result = new Map<string, number>(); // filepath -> fixed count (only files that actually changed)
            for (const [filepath, fileIssues] of byFile) {
                const original = readFile(filepath);
                const fixed = applyFixes(original, fileIssues);

                // Bug fix 1: only record a file if the content actually changed.
                // applyFixes may produce an identical string (e.g. all fixes were
                // no-ops due to conflicting line numbers), so never count or write
                // unless the bytes differ.
                if (fixed === original) continue;

                writeFile(filepath, fixed);

                // Bug fix 2: count the issues whose fix actually produced a diff,
                // not the raw length of fileIssues. We do this by comparing the
                // result of applying each issue in isolation against the original.
                // This avoids over-counting when applyFixes skips or deduplicates
                // some fixes internally.
                const appliedCount = fileIssues.filter((iss) => {
                    const solo = applyFixes(original, [iss]);
                    return solo !== original;
                }).length;

                // Bug fix 3: after writing, re-check for cascade issues (fixes can
                // shift line numbers and expose new problems). Apply them immediately
                // but do NOT add their count to the reported total - they were not
                // part of the original issue list the caller passed in and would
                // inflate the "N issues fixed" number beyond what was reported.
                const srcDir = filepath.includes('test/')
                ? 'test'
                : filepath.includes('bench/')
                ? 'bench'
                : 'src';
                const reScanContent = readFile(filepath);
                const reIssues = [
                    ...checkFileHeader(filepath, srcDir, reScanContent),
                    ...parseFile(filepath, reScanContent),
                ].filter((i) => i.fixable && i.fix);

                if (reIssues.length > 0) {
                    const reFinal = applyFixes(reScanContent, reIssues);
                    if (reFinal !== reScanContent) {
                        writeFile(filepath, reFinal);
                    }
                }

                result.set(filepath, appliedCount);
            }
            return result;
        }

    // └────────────────────────────────────────────────────────────────────┘

// ╚══════════════════════════════════════════════════════════════════════════════════════╝