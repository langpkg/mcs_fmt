// src/fmt/ts/index.ts
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import { checkFileHeader, parseFile, applyFixes }    from './format';
    import { formatAllSections, formatPackSection }      from './pack_format';
    import { formatConstSection }                        from './const_format';
    import { formatTypeSection }                         from './type_format';
    import { FormatResult }                              from '../../common/types';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CORE ════════════════════════════════════════╗

    // Codes that mean the section structure is broken beyond safe auto-repair.
    // If any of these are present the file must be fixed manually first.
    const STRUCTURAL_CODES = new Set([
        'L1_UNCLOSED',
        'L2_UNCLOSED',
        'L3_UNCLOSED',
        'L1_UNMATCHED_CLOSE',
        'L2_UNMATCHED_CLOSE',
        'L3_UNMATCHED_CLOSE',
    ]);

    export function formatTS(src: string, filename = ''): FormatResult {
        let current = src;
        let count   = 0;

        const srcDir = filename.includes('/test/')  ? 'test'
        : filename.includes('/bench/') ? 'bench'
        : 'src';

        // ╭── Phase 0: structural integrity check ───────────────────╮

            // Run the parser once before touching anything. If the section structure
            // is broken (unclosed or unmatched markers) we refuse to format and
            // return the original source unchanged with the errors listed.
            // Attempting to auto-fix these issues causes cascading line-number
            // shifts that corrupt other pending fixes, so the user must resolve
            // them manually first.
            const preIssues = parseFile(filename, current);
            const structural = preIssues.filter(i => STRUCTURAL_CODES.has(i.code));
            if (structural.length > 0) {
                return {
                    formatted : src,
                    count     : 0,
                    errors    : structural.map(i => ({ message: i.message, line: i.line })),
                };
            }

        // ╰──────────────────────────────────────────────────────────╯


        // ╭── Phase 1: structural fixes (section markers) ───────────╮

            // Header check requires a real filename to derive the expected path comment.
            // Skip it when no filename is provided (e.g. in-memory / test usage) to
            // prevent HEADER_MISSING firing every iteration and looping until itr = 0.
            //
            // Fix one issue at a time: each fix shifts line numbers, so re-scan from
            // scratch after every applied fix until no fixable issues remain.
            // Cap iterations to prevent timeout on very large files.
            let itr = Math.min(current.split('\n').length * 4, 3000);
            while (itr-- > 0) {
                const issues = [
                    ...(filename ? checkFileHeader(filename, srcDir, current) : []),
                    ...parseFile(filename, current),
                ];

                const issue = issues.find(i => i.fixable && i.fix);
                if (!issue) break;

                current = applyFixes(current, [issue]);
                count++;
            }

        // ╰──────────────────────────────────────────────────────────╯


        // ╭── Phase 2: section-level transforms (PACK + CONST + TYPE) ──╮

            // Pure in-memory reformatters with no line-number dependency -
            // safe to compose in a single pass.
            const lines        = current.split('\n').map(line => line.trimEnd());
            const afterPack    = formatPackSection(lines);
            const afterConst   = formatConstSection(afterPack);
            const afterType    = formatTypeSection(afterConst);
            const afterAll     = formatAllSections(afterType);

        // ╰─────────────────────────────────────────────────────────────╯


        // ╭── Phase 3: rest... ──────────────────────────────────────╮

            // Ensure blank padding inside section blocks:
            // - If the block contains section markers (// or /*), ensure a blank
            //   immediately after the opener and immediately before the closer when
            //   the block is non-empty. If the block is empty, ensure exactly one blank line.
            // - If the user already has a blank after the opener but not before the closer,
            //   add the missing blank before the closer.
            function ensureBlockPadding(srcLines: string[]): string[] {
                const out = [...srcLines];
                for (let i = 0; i < out.length - 1; i++) {
                    const cur = out[i];
                    if (!cur.trim().endsWith('{') && !cur.trim().endsWith('[')) continue;

                    // Only operate on blocks that are the primary block of a section.
                    // Find the nearest section-open marker above; if there is any real code
                    // (non-comment, non-blank) between the marker and this opener, then
                    // this opener is nested and should be skipped.
                    let scan = i - 1;
                    let foundMarker = -1;
                    let sawCodeBefore = false;
                    while (scan >= 0) {
                        const ln = (out[scan] ?? '');
                        if (ln.trim() === '') { scan--; continue; }
                        if (/\/\/.*[╔]/.test(ln)) { foundMarker = scan; break; }
                        if (!ln.trimStart().startsWith('//') && !ln.trimStart().startsWith('/*')) { sawCodeBefore = true; break; }
                        scan--;
                    }
                    if (foundMarker === -1 || sawCodeBefore) continue;

                    // Find matching closer by tracking simple brace depth.
                    let depth = 0;
                    const openerLine = cur;
                    for (const ch of openerLine) {
                        if (ch === '{' || ch === '[') depth++;
                        else if (ch === '}' || ch === ']') depth--;
                    }

                    let closerIdx = -1;
                    for (let j = i + 1; j < out.length; j++) {
                        const line = out[j];
                        for (const ch of line) {
                            if (ch === '{' || ch === '[') depth++;
                            else if (ch === '}' || ch === ']') depth--;
                        }
                        if (depth <= 0) { closerIdx = j; break; }
                    }
                    if (closerIdx === -1) continue;

                    const blockSlice = out.slice(i + 1, closerIdx);
                    const hasSectionMarker = blockSlice.some(l => /[╔╚┌└╭╰]/.test(l));
                    const nonMarkerContent = blockSlice.some(l => (l ?? '').trim().length > 0 && !l.trimStart().startsWith('//') && !l.trimStart().startsWith('/*'));

                    const hasBlankAfterOpener = (out[i + 1] ?? '').trim() === '';
                    const hasBlankBeforeCloser = (out[closerIdx - 1] ?? '').trim() === '';

                    if (hasSectionMarker) {
                        // For blocks that contain sections, preserve user's blank-line preference.
                        // If empty block, ensure a single blank between opener and closer.
                        // If non-empty, respect existing style (don't force blanks).
                        if (!nonMarkerContent) {
                            if (!hasBlankAfterOpener) out.splice(i + 1, 0, '');
                        }
                        // For non-empty blocks with section markers, preserve exactly as-is
                        // (user's choice of blank or no-blank before closer is respected)
                        continue;
                    }

                    // Skip small algorithmic blocks that start with control-flow statements.
                    const firstContentLine = blockSlice.find(l => (l ?? '').trim().length > 0) ?? '';
                    if (/^\s*(while|for|if|switch)\b/.test(firstContentLine)) continue;

                    if (!nonMarkerContent) {
                        // empty non-section block: ensure one blank after opener
                        if (!hasBlankAfterOpener) out.splice(i + 1, 0, '');
                        continue;
                    }

                    // If user has no blank after opener and no blank before closer, preserve exactly.
                    if (!hasBlankAfterOpener && !hasBlankBeforeCloser) continue;

                    // If user has blank after opener but not before closer, add the missing blank before closer.
                    if (hasBlankAfterOpener && !hasBlankBeforeCloser) {
                        out.splice(closerIdx, 0, '');
                        continue;
                    }

                    // If user has blank before closer but not after opener, remove it to preserve style.
                    if (!hasBlankAfterOpener && hasBlankBeforeCloser) {
                        out.splice(closerIdx - 1, 1);
                        continue;
                    }

                    // Otherwise (both sides have blanks), preserve the existing style exactly.
                }
                return out;
            }

            const afterAllPadded = ensureBlockPadding(afterAll);
            const afterSection = afterAllPadded.join('\n');

            if (afterSection !== current) {
                current = afterSection;
                count++;
            }

            // ── Collect remaining non-fixable issues for the error list ─
            const errors = [
                ...(filename ? checkFileHeader(filename, srcDir, current) : []),
                ...parseFile(filename, current),
            ]
            .filter(i => !i.fixable)
            .map(i => ({ message: i.message, line: i.line }));

            return {
                formatted : current,
                count,
                errors,
            };

        // ╰──────────────────────────────────────────────────────────╯

    }

// ╚══════════════════════════════════════════════════════════════════════════════════════╝