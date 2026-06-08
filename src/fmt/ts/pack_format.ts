// src/fmt/ts/pack_format.ts
//
// Made with ❤️ by Maysara.



// ╔═══════════════════════════════════════ CONST ════════════════════════════════════════╗

    const PACK_OPEN_RE     = /^(\s*)\/\/ ╔(═+) PACK (═+)╗\s*$/;
    const PACK_CLOSE_RE    = /^(\s*)\/\/ ╚(═+)╝\s*$/;
    const IMPORT_ANY_RE    = /^import /;
    const EXPORT_ANY_RE    = /^export /;
    const MAX_LINE         = 88;
    const INDENT           = '    ';
    const MIN_GAP          = 4;

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ TYPE ════════════════════════════════════════╗

    type EntryKind = 'star' | 'type' | 'named';
    type EntryRole = 'import' | 'export';

    interface ParsedEntry {
        role       : EntryRole;
        kind       : EntryKind;
        specifiers : string;
        source     : string;
        names      : string[];
    }

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CORE ════════════════════════════════════════╗

    // ┌─────────────────────────────── EXTRACT ────────────────────────────┐

        /**
        * Join multi-line import/export continuations into single statements.
        * Blank lines inside continuations are dropped; those outside are preserved.
        */
        function joinContinuations(rawLines: string[]): string[] {
            const out: string[] = [];
            let pending = '';

            for (const line of rawLines) {
                const trimmed = line.trim();

                if (trimmed === '') {
                    if (pending) continue;
                    out.push(line);
                    continue;
                }

                if (pending) {
                    pending += ' ' + trimmed;
                    const opens  = (pending.match(/\{/g) || []).length;
                    const closes = (pending.match(/\}/g) || []).length;
                    if (opens <= closes) { out.push(pending); pending = ''; }
                } else {
                    const isKw = IMPORT_ANY_RE.test(trimmed) || EXPORT_ANY_RE.test(trimmed);
                    if (isKw) {
                        const opens  = (trimmed.match(/\{/g) || []).length;
                        const closes = (trimmed.match(/\}/g) || []).length;
                        if (opens > closes) { pending = trimmed; continue; }
                    }
                    out.push(line);
                }
            }

            if (pending) out.push(pending);
            return out;
        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌──────────────────────────────── PARSE ─────────────────────────────┐

        /**
        * Parse a single (already-joined) trimmed line as import/export.
        * Returns null for anything that doesn't match.
        */
        function parseLine(trimmed: string): ParsedEntry | null {

            for (const role of ['import', 'export'] as EntryRole[]) {

                if (role === 'import') {
                    // import * as ns from 'x'
                    const starM = trimmed.match(
                        /^import \* as (\S+)\s*from (['"][^'"]+['"])\s*;?$/
                    );
                    if (starM) return {
                        role: 'import', kind: 'star',
                        specifiers: `* as ${starM[1]}`,
                        source: starM[2], names: [starM[1]],
                    };

                    // import defaultName from 'x'
                    const defM = trimmed.match(
                        /^import (\w+)\s*from (['"][^'"]+['"])\s*;?$/
                    );
                    if (defM) return {
                        role: 'import', kind: 'star',
                        specifiers: defM[1],
                        source: defM[2], names: [defM[1]],
                    };
                }

                if (role === 'export') {
                    // export * from 'x'
                    const starExM = trimmed.match(
                        /^export \*\s*from (['"][^'"]+['"])\s*;?$/
                    );
                    if (starExM) return {
                        role: 'export', kind: 'star',
                        specifiers: '*',
                        source: starExM[1], names: [],
                    };
                }

                // <role> type { a, b } from 'x'
                const typeM = trimmed.match(
                    new RegExp(`^${role} type \\{([^}]*)\\}\\s*from (['"][^'"]+['"])\\s*;?$`)
                );
                if (typeM) {
                    const names = typeM[1].split(',').map(n => n.trim()).filter(Boolean);
                    return {
                        role, kind: 'type',
                        specifiers: `{ ${names.join(', ')} }`,
                        source: typeM[2], names,
                    };
                }

                // <role> { a, b } from 'x'
                const namedM = trimmed.match(
                    new RegExp(`^${role} \\{([^}]*)\\}\\s*from (['"][^'"]+['"])\\s*;?$`)
                );
                if (namedM) {
                    const names = namedM[1].split(',').map(n => n.trim()).filter(Boolean);
                    return {
                        role, kind: 'named',
                        specifiers: `{ ${names.join(', ')} }`,
                        source: namedM[2], names,
                    };
                }

            }

            return null;

        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌─────────────────────────────── ANALYSE ────────────────────────────┐

        function isRelativePath(source: string): boolean {
            const s = source.replace(/^['"]|['"]$/g, '');
            return s.startsWith('./') || s.startsWith('../');
        }

        /** Length of `    role kindPrefix specifiers` - the prefix before padding+from */
        function specifierLen(e: ParsedEntry, bracePad = 0): number {
            const kindPrefix = e.kind === 'type' ? 'type ' : ' '.repeat(bracePad);
            return (INDENT + e.role + ' ' + kindPrefix + e.specifiers).length;
        }

        /** Total single-line length with given fromCol */
        function singleLineLen(e: ParsedEntry, fromCol: number, bracePad = 0): number {
            return Math.max(specifierLen(e, bracePad) + MIN_GAP, fromCol) + 'from '.length + e.source.length + 1;
        }

        /**
        * Simulate the multi-line wrapping for one entry at a given fromCol
        * and return the character-length of the last line up to (and including) `}`.
        *
        * This mirrors renderEntry's break logic exactly, making fromCol convergence
        * work correctly.
        */
        function simulateWrapLastLen(e: ParsedEntry, fromCol: number, bracePad = 0): number {
            const kindPrefix = e.kind === 'type' ? 'type ' : ' '.repeat(bracePad);
            const keyword    = `${e.role} ${kindPrefix}`;
            const braceCol   = INDENT.length + keyword.length;
            const contIndent = ' '.repeat(braceCol);

            let cur = `${INDENT}${keyword}{ ${e.names[0]}`;

            for (let i = 1; i < e.names.length; i++) {
                const fragment       = `, ${e.names[i]}`;
                const tentativeClose = cur + fragment + ` }`;
                const pad            = ' '.repeat(Math.max(MIN_GAP, fromCol - tentativeClose.length));
                const tentativeLine  = tentativeClose + pad + `from ${e.source};`;

                if (tentativeLine.length > MAX_LINE) {
                    cur = `${contIndent}  ${e.names[i]}`;
                } else {
                    cur += fragment;
                }
            }

            return (cur + ' }').length;
        }

        /**
        * Compute the GLOBAL from-alignment column that satisfies ALL entries:
        *
        * - Single-line entries: fromCol ≥ specifierLen + MIN_GAP
        * - Wrapped entries: fromCol ≥ lastLineClosingLen(fromCol) + MIN_GAP
        *
        * Because wrapped entries' last-line length depends on fromCol (larger fromCol
        * → fewer breaks → longer last line), we iterate until convergence.
        * In practice 2-3 passes always suffice.
        */
        function computeGlobalFromCol(singleEntries: ParsedEntry[], wrappedEntries: ParsedEntry[], bracePad = 0): number {
            // Baseline: maximum single-line prefix length
            let fromCol = singleEntries.reduce((m, e) => Math.max(m, specifierLen(e, bracePad)), 0) + MIN_GAP;

            for (let pass = 0; pass < 8; pass++) {
                let maxNeeded = fromCol;

                for (const e of wrappedEntries) {
                    const lastLen = simulateWrapLastLen(e, fromCol, bracePad);
                    maxNeeded = Math.max(maxNeeded, lastLen + MIN_GAP);
                }

                if (maxNeeded === fromCol) break; // converged
                fromCol = maxNeeded;
            }

            return fromCol;
        }

        /**
        * Sort and group entries into render-order groups.
        *
        * Within imports:
        *   1. Each wrapped named entry in its own group (blank between), longest first
        *   2. Relative single-line named entries, by specifier length desc
        *   3. Package + star entries, by specifier length desc
        *   4. Type entries, by specifier length desc
        *
        * Then the same structure for exports.
        *
        * fromCol is computed GLOBALLY across all groups using convergence so that
        * `from` aligns at the same column for every line (single and multi-line).
        */
        function groupEntries(entries: ParsedEntry[]): { groups: ParsedEntry[][], fromCol: number, bracePad: number } {
            // Determine which named entries will wrap.
            // Use only non-star entries' specifier lengths for the provisional fromCol -
            // entries whose specifiers alone exceed MAX_LINE are obviously wrapping and
            // must not inflate the column used to decide whether others wrap too.
            const hasType = entries.some(e => e.kind === 'type');
            const bracePad = hasType ? 5 : 0; // 'type '.length to align {
            const MAX_SPEC = MAX_LINE - MIN_GAP - 'from '.length - 2; // rough upper bound
            const provisionalFromCol = entries
            .filter(e => specifierLen(e, bracePad) <= MAX_SPEC)
            .reduce((m, e) => Math.max(m, specifierLen(e, bracePad)), 0) + MIN_GAP;
            const willWrap = (e: ParsedEntry) =>
            (e.kind === 'named' || e.kind === 'type') && singleLineLen(e, provisionalFromCol, bracePad) > MAX_LINE;

            function buildGroups(list: ParsedEntry[]): ParsedEntry[][] {
                const named = list.filter(e => e.kind === 'named');
                const star  = list.filter(e => e.kind === 'star');
                const type  = list.filter(e => e.kind === 'type');

                const namedWrap   = named.filter(willWrap).sort((a, b) => specifierLen(b, bracePad) - specifierLen(a, bracePad));
                const namedSingle = named.filter(e => !willWrap(e));

                const namedRel = namedSingle
                .filter(e =>  isRelativePath(e.source))
                .sort((a, b) => specifierLen(b, bracePad) - specifierLen(a, bracePad));

                const namedPkg = [...namedSingle.filter(e => !isRelativePath(e.source)), ...star]
                .sort((a, b) => specifierLen(b, bracePad) - specifierLen(a, bracePad));

                const typeWrap  = type.filter(willWrap).sort((a, b) => specifierLen(b, bracePad) - specifierLen(a, bracePad));
                const typeSingle = type.filter(e => !willWrap(e));
                const typeSorted = [...typeSingle].sort((a, b) => specifierLen(b, bracePad) - specifierLen(a, bracePad));

                const groups: ParsedEntry[][] = [];
                for (const e of namedWrap) groups.push([e]);  // each wrapped alone
                if (namedRel.length > 0)    groups.push(namedRel);
                if (namedPkg.length > 0)    groups.push(namedPkg);
                for (const e of typeWrap)   groups.push([e]);  // each wrapped alone
                if (typeSorted.length > 0)  groups.push(typeSorted);
                return groups;
            }

            const importGroups = buildGroups(entries.filter(e => e.role === 'import'));
            const exportGroups = buildGroups(entries.filter(e => e.role === 'export'));
            const allGroups = [...importGroups, ...exportGroups];

            // Compute global fromCol with convergence
            const wrappedEntries = entries.filter(willWrap);
            const singleEntries  = entries.filter(e => !willWrap(e));
            const fromCol = computeGlobalFromCol(singleEntries, wrappedEntries, bracePad);

            return { groups: allGroups, fromCol, bracePad };
        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌─────────────────────────────── RENDER ─────────────────────────────┐

        /**
        * Render one entry as one or more output lines.
        *
        * Single-line:  INDENT role kindPrefix specifiers <padding> from 'source';
        * Multi-line:   INDENT role { name0, name1,
            *               <contIndent>  name2 }     from 'source';
        *
        * contIndent = spaces equal to column of `{`, so continuation lines
        * align under the opening brace.
        *
        * All entries share the same global fromCol so `from` aligns vertically.
        */
        function renderEntry(entry: ParsedEntry, fromCol: number, bracePad = 0): string[] {
            const kw = entry.role;

            // ── Star / default ──────────────────────────────────────────
            if (entry.kind === 'star') {
                const prefix  = `${INDENT}${kw} ${entry.specifiers}`;
                const padding = ' '.repeat(Math.max(MIN_GAP, fromCol - prefix.length));
                return [`${prefix}${padding}from ${entry.source};`];
            }

            // ── Named / type ────────────────────────────────────────────
            const kindPrefix = entry.kind === 'type' ? 'type ' : ' '.repeat(bracePad);
            const keyword    = `${kw} ${kindPrefix}`;

            const singlePrefix  = `${INDENT}${keyword}${entry.specifiers}`;
            const singlePadding = ' '.repeat(Math.max(MIN_GAP, fromCol - singlePrefix.length));
            const singleLine    = `${singlePrefix}${singlePadding}from ${entry.source};`;

            if (singleLine.length <= MAX_LINE) return [singleLine];

            // ── Multi-line wrap ─────────────────────────────────────────
            // Continuation lines are indented to align under the `{`.
            const braceCol   = INDENT.length + keyword.length;
            const contIndent = ' '.repeat(braceCol);

            const resultLines: string[] = [];
            let cur = `${INDENT}${keyword}{ ${entry.names[0]}`;

            for (let i = 1; i < entry.names.length; i++) {
                const fragment       = `, ${entry.names[i]}`;
                const tentativeClose = cur + fragment + ` }`;
                const pad            = ' '.repeat(Math.max(MIN_GAP, fromCol - tentativeClose.length));
                const tentativeLine  = tentativeClose + pad + `from ${entry.source};`;

                if (tentativeLine.length > MAX_LINE) {
                    resultLines.push(cur + ',');
                    cur = `${contIndent}  ${entry.names[i]}`;
                } else {
                    cur += fragment;
                }
            }

            const lastContent = cur + ' }';
            const fromPadding = ' '.repeat(Math.max(MIN_GAP, fromCol - lastContent.length));
            resultLines.push(`${lastContent}${fromPadding}from ${entry.source};`);

            return resultLines;
        }

        /** Returns true when an entry renders as more than one line at the given fromCol. */
        function isMultiLine(entry: ParsedEntry, fromCol: number, bracePad = 0): boolean {
            return renderEntry(entry, fromCol, bracePad).length > 1;
        }

        /**
        * Render groups separated by blank lines only when the boundary involves a
        * multi-line entry - i.e. insert a blank between group[g-1] and group[g] when
        * any entry in group[g-1] OR any entry in group[g] wraps to multiple lines.
        * Adjacent single-line-only groups are kept together with no blank line between.
        */
        function renderGroups(groups: ParsedEntry[][], fromCol: number, bracePad = 0): string[] {
            const result: string[] = [];
            for (let g = 0; g < groups.length; g++) {
                if (g > 0) {
                    const prevHasWrap = groups[g - 1].some(e => isMultiLine(e, fromCol, bracePad));
                    const currHasWrap = groups[g].some(e => isMultiLine(e, fromCol, bracePad));
                    if (prevHasWrap || currHasWrap) result.push('');
                }
                for (const entry of groups[g]) {
                    result.push(...renderEntry(entry, fromCol, bracePad));
                }
            }
            return result;
        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌─────────────────────────────── FORMAT ─────────────────────────────┐

        /**
        * Full pipeline for a PACK section body:
        *   1. Extract  - join continuation lines
        *   2. Parse    - classify each statement
        *   3. Analyse  - sort, group, compute global fromCol
        *   4. Render   - emit aligned, wrapped output
        *
        * Non-import/export lines are preserved verbatim after all imports/exports,
        * separated by a blank line.
        */
        function formatPackBody(bodyLines: string[]): string[] {
            const entries   : ParsedEntry[] = [];
            const otherLines: string[]      = [];

            for (const line of joinContinuations(bodyLines)) {
                const trimmed = line.trim();
                if (trimmed === '') continue;

                if (IMPORT_ANY_RE.test(trimmed) || EXPORT_ANY_RE.test(trimmed)) {
                    const parsed = parseLine(trimmed);
                    if (parsed) { entries.push(parsed); continue; }
                }

                otherLines.push(line);
            }

            if (entries.length === 0) return bodyLines;

            // No alignment when alone - a single entry has no neighbour to align with,
            // so no fromCol padding is added.  We still wrap if the plain line exceeds
            // MAX_LINE by using renderEntry with fromCol = 0 (no padding forced), which
            // lets the wrapping logic kick in purely on length grounds.
            if (entries.length === 1) {
                const e        = entries[0];
                const fromCol  = specifierLen(e) + MIN_GAP;
                const rendered = renderEntry(e, fromCol);
                // Single-line result: strip the alignment padding so the `from` sits
                // right after the specifier with one space (no fromCol gap).
                const result: string[] = [];
                if (rendered.length === 1) {
                    const kw         = e.role;
                    const kindPrefix = e.kind === 'type' ? 'type ' : '';
                    result.push(`${INDENT}${kw} ${kindPrefix}${e.specifiers} from ${e.source};`);
                } else {
                    result.push(...rendered);
                }
                if (otherLines.length > 0) { result.push(''); result.push(...otherLines); }
                return result;
            }

            const { groups, fromCol, bracePad } = groupEntries(entries);
            const result = renderGroups(groups, fromCol, bracePad);

            if (otherLines.length > 0) {
                result.push('');
                result.push(...otherLines);
            }

            return result;
        }

        /**
        * Find the PACK section in `lines`, reformat its body, and return the full
        * file with only that section replaced.
        * Returns original lines unchanged when no PACK section is found.
        */
        export function formatPackSection(lines: string[]): string[] {
            // Process every PACK section in the file, not just the first.
            // After each pass, the rebuilt `result` is scanned again starting from
            // just after the section we just processed so we don't re-visit it.
            let result = lines;
            let searchFrom = 0;

            while (true) {
                let openIdx    = -1;
                let openIndent = '';
                for (let i = searchFrom; i < result.length; i++) {
                    const m = result[i].match(PACK_OPEN_RE);
                    if (m) { openIdx = i; openIndent = m[1]; break; }
                }
                if (openIdx === -1) break;

                // Accept only a close marker at the SAME indent level as the open.
                // Prevents inner ╚╝ lines from being mistaken for the PACK section's
                // own close and causing the body to be mis-sliced.
                let closeIdx = -1;
                for (let i = openIdx + 1; i < result.length; i++) {
                    const m = result[i].match(PACK_CLOSE_RE);
                    if (m && m[1] === openIndent) { closeIdx = i; break; }
                }
                if (closeIdx === -1) break;

                const bodyLines     = result.slice(openIdx + 1, closeIdx);
                const formattedBody = formatPackBody(bodyLines);

                // Strip leading/trailing blanks - we add exactly one after open and before close.
                let trimStart = 0;
                let trimEnd   = formattedBody.length;
                while (trimStart < trimEnd && formattedBody[trimStart]?.trim()   === '') trimStart++;
                while (trimEnd > trimStart && formattedBody[trimEnd - 1]?.trim() === '') trimEnd--;
                const trimmedBody = formattedBody.slice(trimStart, trimEnd);

                result = [
                    ...result.slice(0, openIdx),
                    result[openIdx],
                    '',
                    ...trimmedBody,
                    '',
                    result[closeIdx],
                    ...result.slice(closeIdx + 1),
                ];

                // Advance past the close marker so the next iteration picks up any
                // subsequent PACK sections further down the file.
                searchFrom = closeIdx + 1;
            }

            return result;
        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌─────────────────────────────── GENERIC ────────────────────────────┐

        /**
        * Normalise blank lines inside every L1 section (╔…╗ / ╚…╝) that was
        * not already rewritten by formatPackSection or formatConstSection.
        * Rule: exactly one blank line after the open marker and exactly one
        * blank line before the close marker, whenever the body is non-empty.
        */
        export function formatAllSections(lines: string[]): string[] {
            const L1_OPEN_RE  = /^(\s*)\/\/ ╔(═+) \S+ (═+)╗\s*$/;
            const L1_CLOSE_RE = /^(\s*)\/\/ ╚(═+)╝\s*$/;

            let result     = lines;
            let searchFrom = 0;

            while (true) {
                let openIdx    = -1;
                let openIndent = '';
                for (let i = searchFrom; i < result.length; i++) {
                    const m = result[i].match(L1_OPEN_RE);
                    if (m) { openIdx = i; openIndent = m[1]; break; }
                }
                if (openIdx === -1) break;

                let closeIdx = -1;
                for (let i = openIdx + 1; i < result.length; i++) {
                    const m = result[i].match(L1_CLOSE_RE);
                    if (m && m[1] === openIndent) { closeIdx = i; break; }
                }
                if (closeIdx === -1) break;

                const bodyLines  = result.slice(openIdx + 1, closeIdx);

                // Always normalise L1 sections to have exactly one blank line after
                // the open marker and exactly one blank line before the close marker.
                // This mirrors the behaviour of the PACK/CONST specific formatters
                // which also insert these blank lines even for empty bodies.
                let trimStart = 0;
                let trimEnd   = bodyLines.length;
                while (trimStart < trimEnd && bodyLines[trimStart]?.trim()   === '') trimStart++;
                while (trimEnd > trimStart && bodyLines[trimEnd - 1]?.trim() === '') trimEnd--;
                const trimmedBody = bodyLines.slice(trimStart, trimEnd);

                result = [
                    ...result.slice(0, openIdx),
                    result[openIdx],
                    '',
                    ...trimmedBody,
                    '',
                    result[closeIdx],
                    ...result.slice(closeIdx + 1),
                ];

                searchFrom = closeIdx + 1;
            }

            return result;
        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌───────────────────────────────── API ──────────────────────────────┐

        /**
        * Public entry point: apply PACK section import/export formatting to a
        * TypeScript file on disk.  Called AFTER the normal format phase.
        * Returns `true` if the file was changed, `false` otherwise.
        */
        export function formatPackImports(
        filepath: string,
        readFile: (p: string) => string,
        writeFile: (p: string, c: string) => void,
        ): boolean {
            const original = readFile(filepath);
            const lines    = original.split('\n');
            const result   = formatPackSection(lines);
            const output   = result.join('\n');

            if (output === original) return false;

            writeFile(filepath, output);
            return true;
        }

    // └────────────────────────────────────────────────────────────────────┘

// ╚══════════════════════════════════════════════════════════════════════════════════════╝