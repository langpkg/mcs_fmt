// src/fmt/md/md_format.ts
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import { readFile, writeFile }    from '../../common';
    import { FormatIssue }            from '../../common';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔═══════════════════════════════════════ CONST ════════════════════════════════════════╗

    // MD L1 inner width - matches TS L1 inner width (88) minus the 4 chars difference
    // between "// " (3) and "<!-- " (5) + " -->" (4), so we keep the total line width
    // the same (~91 chars).  Inner = total content between <!-- and -->, exclusive.
    // Chosen so the full line reads: <!-- ╔═{inner}═╗ -->  =  5 + inner + 4 = 91 chars.
    // inner = 84 keeps parity with TS: "// " (3) + 88 = 91.
    const MD_L1_INNER               = 62; // inner chars (between <!-- and -->), feels balanced for MD

    // Strict patterns - match well-formed markers
    const RE_MD_L1_OPEN             = /^<!-- (╔)(═+) (\S+) (═+)(╗) -->$/;
    const RE_MD_L1_CLOSE            = /^<!-- (╚)(═+)(╝) -->$/;

    // Lenient patterns - match any line that starts with the right prefix (catches malformed)
    const RE_MD_L1_OPEN_LENIENT     = /^<!--\s*╔/;
    const RE_MD_L1_CLOSE_LENIENT    = /^<!--\s*╚/;

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CORE ════════════════════════════════════════╗

    // ┌──────────────────────────────── BUILD ─────────────────────────────┐

        // Build a correct MD L1 open marker inner content for a given name.
        // Full line will be: <!-- ╔{inner}╗ -->
        // inner = "═{left} {name} {right}═"  with total inner length = MD_L1_INNER
        function makeMdL1Open(name: string): string {

            // Available fill = MD_L1_INNER - 2 (for ╔ and ╗) - 2 (spaces around name) - name.length
            const fill  = MD_L1_INNER - 2 - 2 - name.length;
            const left  = Math.floor(fill / 2);
            const right = fill - left;
            return '╔' + '═'.repeat(left) + ' ' + name + ' ' + '═'.repeat(right) + '╗';

        }

        // Build a correct MD L1 close marker inner content.
        // Matches the width of the corresponding open.
        function makeMdL1Close(name: string): string {
            const open = makeMdL1Open(name);
            return '╚' + '═'.repeat(open.length - 2) + '╝';
        }

        // Wrap inner content in the HTML comment delimiters.
        function wrapOpen(inner: string): string  { return '<!-- ' + inner + ' -->'; }
        function wrapClose(inner: string): string { return '<!-- ' + inner + ' -->'; }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌──────────────────────────────── PARSE ─────────────────────────────┐

        // Parse a single .md file and return all format issues found.
        // No indentation rules, no header check, no L2/L3 - only L1 section markers.
        export function parseMdFile(filepath: string, content: string): FormatIssue[] {
            const issues: FormatIssue[] = [];
            const lines  = content.split('\n');

            const l1Stack: { lineno: number; name: string }[] = [];

            const push = (
                line    : number,
                code    : string,
                message : string,
                fixable : boolean,
                fix?    : FormatIssue['fix'],
            ) =>
            issues.push({
                file     : filepath,
                line,
                code,
                message,
                severity : 'warning',
                fixable,
                fix,
            });

            // ── Pass 1: section markers ─────────────────────────────────

            lines.forEach((raw, idx) => {
                const lineno = idx + 1;

                // ── L1 open ─────────────────────────────────────────────────

                const m1o = RE_MD_L1_OPEN.exec(raw);
                if (m1o) {
                    const name = m1o[3];

                    // Close any still-open L1 before starting a new one
                    if (l1Stack.length > 0) {
                        const unc = l1Stack.pop()!;
                        const closeContent = '\n' + wrapClose(makeMdL1Close(unc.name)) + '\n\n\n';
                        push(
                            unc.lineno,
                            'MD_L1_UNCLOSED',
                            `MD L1 section "${unc.name}" is never closed`,
                            true,
                            { type: 'insert_before_line', line: lineno, content: closeContent },
                        );
                    }

                    // ── Blank lines before L1 ───────────────────────────────────
                    // First L1 in the file: no blank-line requirement.
                    // Subsequent L1 opens: exactly 3 blank lines before.
                    if (idx > 0) {
                        // Check whether any earlier content (non-blank) exists
                        let hasEarlierContent = false;
                        for (let i = idx - 1; i >= 0; i--) {
                            if (lines[i].trim().length > 0) { hasEarlierContent = true; break; }
                        }

                        if (hasEarlierContent) {
                            let blankCount = 0;
                            for (let i = idx - 1; i >= 0 && lines[i].trim().length === 0; i--) blankCount++;

                            if (blankCount !== 3) {
                                if (blankCount < 3) {
                                    push(
                                        lineno,
                                        'MD_L1_BLANK_BEFORE',
                                        `MD L1 section "${name}" must be preceded by 3 blank lines (has ${blankCount})`,
                                        true,
                                        { type: 'insert_before_line', line: lineno, content: '\n'.repeat(3 - blankCount) },
                                    );
                                } else {
                                    push(
                                        lineno,
                                        'MD_L1_BLANK_BEFORE',
                                        `MD L1 section "${name}" must be preceded by 3 blank lines (has ${blankCount}, remove ${blankCount - 3})`,
                                        true,
                                        { type: 'remove_blank_lines', line: lineno, count: blankCount - 3 },
                                    );
                                }
                            }
                        }
                    }

                    // ── Marker width / centering ────────────────────────────────
                    const correct    = makeMdL1Open(name);
                    const innerRaw   = raw.slice(5, -4).trim(); // strip "<!-- " and " -->"
                    if (innerRaw !== correct) {
                        push(
                            lineno,
                            'MD_L1_WIDTH',
                            `MD L1 section "${name}" has wrong width or centering`,
                            true,
                            { type: 'replace_line', line: lineno, content: wrapOpen(correct) },
                        );
                    }

                    l1Stack.push({ lineno, name });
                    return;
                }

                // ── Malformed L1 open (lenient) ─────────────────────────────

                if (RE_MD_L1_OPEN_LENIENT.test(raw) && !RE_MD_L1_CLOSE_LENIENT.test(raw)) {
                    // Try to extract the section name
                    let name = 'NAME';
                    const nm = raw.match(/╔[═\s]*([A-Za-z0-9_]+)/);
                    if (nm) name = nm[1];

                    if (l1Stack.length > 0) {
                        const unc = l1Stack.pop()!;
                        const closeContent = '\n' + wrapClose(makeMdL1Close(unc.name)) + '\n\n\n';
                        push(
                            unc.lineno,
                            'MD_L1_UNCLOSED',
                            `MD L1 section "${unc.name}" is never closed`,
                            true,
                            { type: 'insert_before_line', line: lineno, content: closeContent },
                        );
                    }

                    push(
                        lineno,
                        'MD_L1_INVALID',
                        'MD L1 open marker has invalid formatting',
                        true,
                        { type: 'replace_line', line: lineno, content: wrapOpen(makeMdL1Open(name)) },
                    );

                    l1Stack.push({ lineno, name });
                    return;
                }

                // ── L1 close ────────────────────────────────────────────────

                const m1c = RE_MD_L1_CLOSE.exec(raw);
                if (m1c) {
                    if (l1Stack.length === 0) {
                        push(
                            lineno,
                            'MD_L1_UNMATCHED_CLOSE',
                            'MD L1 close (╚) with no matching open (╔)',
                            false,
                        );
                    } else {
                        const opened  = l1Stack.pop()!;
                        const correct = makeMdL1Close(opened.name);
                        const innerRaw = raw.slice(5, -4).trim();
                        if (innerRaw !== correct) {
                            push(
                                lineno,
                                'MD_L1_CLOSE_WIDTH',
                                `MD L1 close for "${opened.name}" has wrong width`,
                                true,
                                { type: 'replace_line', line: lineno, content: wrapClose(correct) },
                            );
                        }
                    }
                    return;
                }

                // ── Malformed L1 close (lenient) ────────────────────────────

                if (RE_MD_L1_CLOSE_LENIENT.test(raw)) {
                    const name = l1Stack.length > 0 ? l1Stack[l1Stack.length - 1].name : 'NAME';
                    push(
                        lineno,
                        'MD_L1_INVALID',
                        'MD L1 close marker has invalid formatting',
                        true,
                        { type: 'replace_line', line: lineno, content: wrapClose(makeMdL1Close(name)) },
                    );
                    if (l1Stack.length > 0) l1Stack.pop();
                    return;
                }
            });

            // ── Unclosed L1 at EOF ──────────────────────────────────────

            for (const unc of l1Stack) {
                push(
                    unc.lineno,
                    'MD_L1_UNCLOSED',
                    `MD L1 section "${unc.name}" is never closed`,
                    true,
                    { type: 'append_lines', content: '\n' + wrapClose(makeMdL1Close(unc.name)) },
                );
            }

            // ── Pass 2: section padding (blank line after open, before close) ─

            // Re-parse to find matched open/close pairs and check inner padding.
            // We build a list of (openIdx, closeIdx, name) from the now-fixed view.
            // Since issues may overlap with fixes not yet applied, we work on the
            // original lines - users will see the padding fixed on next run if needed,
            // OR we do it in one pass by scanning for pairs directly.

            const pairs: { openIdx: number; closeIdx: number; name: string }[] = [];
            {
                const stack: { idx: number; name: string }[] = [];
                lines.forEach((raw, idx) => {
                    const mo = RE_MD_L1_OPEN.exec(raw);
                    if (mo)  { stack.push({ idx, name: mo[3] }); return; }
                    if (RE_MD_L1_CLOSE.exec(raw) && stack.length > 0) {
                        const opened = stack.pop()!;
                        pairs.push({ openIdx: opened.idx, closeIdx: idx, name: opened.name });
                    }
                });
            }

            for (const { openIdx, closeIdx, name } of pairs) {
                // Collect real content lines between open and close
                let firstContentIdx = -1;
                let lastContentIdx  = -1;
                for (let i = openIdx + 1; i < closeIdx; i++) {
                    if (lines[i].trim().length > 0) {
                        if (firstContentIdx === -1) firstContentIdx = i;
                        lastContentIdx = i;
                    }
                }

                if (firstContentIdx === -1) {
                    // Empty section: ensure at least 1 blank line between markers
                    const hasBlank = lines.slice(openIdx + 1, closeIdx).some(l => l.trim() === '');
                    if (!hasBlank) {
                        push(
                            openIdx + 1,
                            'MD_SECTION_EMPTY_NO_BLANK',
                            `Empty MD section "${name}" must have at least 1 blank line between markers`,
                            true,
                            { type: 'insert_after_line', line: openIdx + 1, content: '' },
                        );
                    }
                } else {
                    // ── Blank line after open ───────────────────────────────────
                    if (firstContentIdx === openIdx + 1) {
                        push(
                            openIdx + 1,
                            'MD_SECTION_BLANK_AFTER_OPEN',
                            `Must have blank line after MD section "${name}" open`,
                            true,
                            { type: 'insert_after_line', line: openIdx + 1, content: '' },
                        );
                    } else {
                        const excess = firstContentIdx - openIdx - 2; // allowed: exactly 1 blank
                        if (excess > 0) {
                            push(
                                firstContentIdx + 1,
                                'MD_SECTION_EXCESS_BLANK_AFTER_OPEN',
                                `Only 1 blank line allowed after MD section "${name}" open (remove ${excess})`,
                                true,
                                { type: 'remove_blank_lines', line: firstContentIdx + 1, count: excess },
                            );
                        }
                    }

                    // ── Blank line before close ─────────────────────────────────
                    if (lastContentIdx === closeIdx - 1) {
                        push(
                            lastContentIdx + 1,
                            'MD_SECTION_BLANK_BEFORE_CLOSE',
                            `Must have blank line before MD section "${name}" close`,
                            true,
                            { type: 'insert_after_line', line: lastContentIdx + 1, content: '' },
                        );
                    } else {
                        const excess = closeIdx - lastContentIdx - 2; // allowed: exactly 1 blank
                        if (excess > 0) {
                            push(
                                closeIdx + 1,
                                'MD_SECTION_EXCESS_BLANK_BEFORE_CLOSE',
                                `Only 1 blank line allowed before MD section "${name}" close (remove ${excess})`,
                                true,
                                { type: 'remove_blank_lines', line: closeIdx + 1, count: excess },
                            );
                        }
                    }
                }
            }

            // ── Pass 3: excess consecutive blank lines ──────────────────
            //
            // Runs of 2+ blank lines in regular content are collapsed to 1.
            // Runs adjacent to section markers are exempt (governed by L1_BLANK_BEFORE
            // and section padding rules above).

            const isMarker = (line: string): boolean =>
            RE_MD_L1_OPEN.test(line) || RE_MD_L1_CLOSE.test(line);

            {
                let i = 0;
                while (i < lines.length) {
                    if (lines[i].trim().length !== 0) { i++; continue; }

                    const runStart = i;
                    while (i < lines.length && lines[i].trim().length === 0) i++;
                    const runEnd    = i;
                    const runLength = runEnd - runStart;

                    if (runLength < 2) continue;

                    const lineBefore = runStart > 0           ? lines[runStart - 1] : '';
                    const lineAfter  = runEnd < lines.length  ? lines[runEnd]       : '';

                    if (isMarker(lineBefore) || isMarker(lineAfter)) continue;

                    const hasCodeBefore = runStart > 0          && lineBefore.trim().length > 0;
                    const hasCodeAfter  = runEnd < lines.length && lineAfter.trim().length  > 0;
                    if (!hasCodeBefore && !hasCodeAfter) continue;

                    const excess = runLength - 1;
                    push(
                        runEnd,
                        'MD_EXCESS_BLANK_LINES',
                        `${runLength} consecutive blank lines found; only 1 is allowed here (remove ${excess})`,
                        true,
                        { type: 'remove_blank_lines', line: runEnd, count: excess },
                    );
                }
            }

            // ── Pass 4: trailing whitespace ─────────────────────────────

            lines.forEach((raw, idx) => {
                if (/\s+$/.test(raw)) {
                    push(
                        idx + 1,
                        'MD_TRAILING_SPACE',
                        'Line has trailing whitespace',
                        true,
                        { type: 'replace_line', line: idx + 1, content: raw.replace(/\s+$/, '') },
                    );
                }
            });

            return issues;
        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌──────────────────────────────── APPLY ─────────────────────────────┐

        // Apply all fixable issues to a file's content and return the corrected string.
        // Uses the same fix-type protocol as format.ts → applyFixes(), so the same
        // helper can be used; this standalone version keeps md_format.ts self-contained.
        export function applyMdFixes(content: string, issues: FormatIssue[]): string {
            let result = content;

            // ── 1. replace_line ─────────────────────────────────────────
            const fixMap = new Map<number, string>();
            for (const issue of issues) {
                if (issue.fix?.type === 'replace_line') fixMap.set(issue.fix.line, issue.fix.content);
            }
            if (fixMap.size > 0) {
                const ls = result.split('\n');
                fixMap.forEach((replacement, lineno) => { ls[lineno - 1] = replacement; });
                result = ls.join('\n');
            }

            // ── 2. remove_blank_lines (descending order to avoid index drift) ─
            const removeFixes = issues
            .filter(i => i.fix?.type === 'remove_blank_lines')
            .sort((a, b) =>
            (b.fix as { line: number }).line - (a.fix as { line: number }).line
            );
            if (removeFixes.length > 0) {
                const ls = result.split('\n');
                for (const issue of removeFixes) {
                    const line  = (issue.fix as { line: number }).line;
                    const count = (issue.fix as { count: number }).count;
                    const startIdx = line - 1 - count;
                    if (startIdx >= 0) ls.splice(startIdx, count);
                }
                result = ls.join('\n');
            }

            // ── 3. insert_after_line (descending order) ─────────────────
            const insertFixes = issues
            .filter(i => i.fix?.type === 'insert_after_line')
            .sort((a, b) =>
            (b.fix as { line: number }).line - (a.fix as { line: number }).line
            );
            if (insertFixes.length > 0) {
                const ls = result.split('\n');
                for (const issue of insertFixes) {
                    const afterLine = (issue.fix as { line: number }).line;
                    const cnt       = (issue.fix as { content: string }).content;
                    ls.splice(afterLine, 0, cnt);
                }
                result = ls.join('\n');
            }

            // ── 4. insert_before_line (descending order) ────────────────
            const insertBeforeFixes = issues
            .filter(i => i.fix?.type === 'insert_before_line')
            .sort((a, b) =>
            (b.fix as { line: number }).line - (a.fix as { line: number }).line
            );
            if (insertBeforeFixes.length > 0) {
                const ls = result.split('\n');
                for (const issue of insertBeforeFixes) {
                    const beforeLine = (issue.fix as { line: number }).line;
                    const cnt        = (issue.fix as { content: string }).content;
                    ls.splice(beforeLine - 1, 0, cnt);
                }
                result = ls.join('\n');
            }

            // ── 5. append_lines ─────────────────────────────────────────
            const appends = issues.filter(i => i.fix?.type === 'append_lines');
            if (appends.length > 0) {
                const appendContent = appends
                .map(i => (i.fix as { content: string }).content)
                .join('\n');
                result = result.endsWith('\n')
                ? result + appendContent
                : result + '\n' + appendContent;
            }

            return result;
        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌─────────────────────────────── RUNNER ─────────────────────────────┐

        // Scan, fix, and return the number of issues fixed per file.
        // Caller passes a CacheManager-compatible interface so the runner integrates
        // with the existing fmt command cache without coupling this module to it.
        export async function applyMdFormatFixes(
        issues: FormatIssue[],
        ): Promise<Map<string, number>> {
            const byFile = new Map<string, FormatIssue[]>();
            for (const issue of issues) {
                if (!issue.fixable || !issue.fix) continue;
                if (!byFile.has(issue.file)) byFile.set(issue.file, []);
                byFile.get(issue.file)!.push(issue);
            }

            const result = new Map<string, number>();
            for (const [filepath, fileIssues] of byFile) {
                try {
                    const original = readFile(filepath);
                    const fixed    = applyMdFixes(original, fileIssues);
                    if (fixed !== original) {
                        writeFile(filepath, fixed);
                        result.set(filepath, fileIssues.length);

                        // Re-check for any cascading issues introduced by our fixes
                        const reContent = readFile(filepath);
                        const reIssues  = parseMdFile(filepath, reContent).filter(i => i.fixable && i.fix);
                        if (reIssues.length > 0) {
                            const reFinal = applyMdFixes(reContent, reIssues);
                            if (reFinal !== reContent) {
                                writeFile(filepath, reFinal);
                                result.set(filepath, (result.get(filepath) ?? 0) + reIssues.length);
                            }
                        }
                    }
                } catch {
                    // Silently skip unreadable files
                }
            }
            return result;
        }

    // └────────────────────────────────────────────────────────────────────┘

// ╚══════════════════════════════════════════════════════════════════════════════════════╝