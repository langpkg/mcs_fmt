// test/index.test.ts
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import { formatTS, formatMD, formatJSON }         from '../src';
    import { readFileSync, readdirSync, statSync }    from 'node:fs';
    import { describe, it, expect }                   from 'bun:test';
    import { dirname, join }                          from 'node:path';
    import { fileURLToPath }                          from 'node:url';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ HELP ════════════════════════════════════════╗

    interface Template {
        kind        : string;
        name        : string;
        input       : string;
        output      : string;
        inputPath   : string;
        outputPath  : string;
    }

    const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), 'templates');

    const getTemplates = (): Template[] => {
        const kinds = readdirSync(fixturesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

        return kinds.flatMap((kind) => {
            const kindDir           = join(fixturesRoot, kind);
            const groups            = readdirSync(kindDir, { withFileTypes: true })
            .filter((entry)     => entry.isDirectory())
            .map((entry)        => entry.name);

            return groups.map((groupName) => {
                const groupDir      = join(kindDir, groupName);
                const groupFiles    = readdirSync(groupDir);
                const inputFile     = groupFiles.find((name) => name.startsWith('input'));
                const outputFile    = groupFiles.find((name) => name.startsWith('output'));

                if (!inputFile) {
                    throw new Error(`Missing input file for template ${kind}/${groupName}`);
                }

                if (!outputFile) {
                    throw new Error(`Missing output file for template ${kind}/${groupName}`);
                }

                const inputPath     = join(groupDir, inputFile);
                const outputPath    = join(groupDir, outputFile);

                if (!statSync(inputPath).isFile()) {
                    throw new Error(`Missing input file for template ${kind}/${groupName}`);
                }

                if (!statSync(outputPath).isFile()) {
                    throw new Error(`Missing output file for template ${kind}/${groupName}`);
                }

                return {
                    kind,
                    name            : groupName,
                    input           : readFileSync(inputPath, 'utf8'),
                    output          : readFileSync(outputPath, 'utf8'),
                    inputPath,
                    outputPath,
                };
            });
        });
    };

    const normalize = (str: string) => str.replace(/\r\n/g, '\n');

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ TEST ════════════════════════════════════════╗

    describe('@langpkg/mcs_fmt', () => {
        const templates = getTemplates();

        templates.forEach((template) => {
            it(`Template[${template.kind}/${template.name}] should be formatted correctly`, () => {
                let actual: string;

                switch (template.kind) {
                    case 'json':
                    actual = formatJSON(template.input, template.inputPath).formatted;
                    break;
                    case 'md':
                    actual = formatMD(template.input).formatted;
                    break;
                    case 'ts':
                    actual = formatTS(template.input, `${template.kind}/${template.name}/output.ts`).formatted;
                    // actual = formatTS(template.input).formatted;
                    break;
                    default:
                    throw new Error(`Unsupported template kind: ${template.kind}`);
                }

                expect(normalize(actual)).toBe(normalize(template.output));
            });
        });
    });

// ╚══════════════════════════════════════════════════════════════════════════════════════╝