// src/fmt/md/index.ts
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import { parseMdFile, applyMdFixes }    from './md_format';
    import { FormatResult }                 from '../../common/types';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CORE ════════════════════════════════════════╗

    export function formatMD(src: string, filename = ''): FormatResult {
        let current = src;
        let count   = 0;

        // Fix one issue at a time: each fix may shift line numbers, so re-scan
        // from scratch after every applied fix until the file is clean.
        const MAX_FIXES = 1000;
        let   itr       = 0;
        while (itr++ < MAX_FIXES) {
            const issues = parseMdFile(filename, current);
            const issue  = issues.find(i => i.fixable && i.fix);
            if (!issue) break;

            current = applyMdFixes(current, [issue]);
            count++;
        }

        // Collect any remaining non-fixable issues for the error list
        const errors = parseMdFile(filename, current)
        .filter(i => !i.fixable)
        .map(i => ({ message: i.message, line: i.line }));

        return {
            formatted : current,
            count,
            errors,
        };
    }

// ╚══════════════════════════════════════════════════════════════════════════════════════╝