import babel from '@babel/core';
import generate from '@babel/generator';
import tsPlugin from '@babel/plugin-syntax-typescript';
import tsPreset from '@babel/preset-typescript';
import t from '@babel/types';
import fs from 'fs';
import { glob } from 'glob';

/**
 * - add watch cmd that combines sdk build and this
 */

/**
 * @typedef {import('@babel/core').PluginObj} babel.PluginObj
 * @typedef {babel.PluginObj} InlinePlugin
 */

const buildInlineFns = async () => {
  console.log('Building inline functions...');

  const init_cwd = process.env.INIT_CWD;

  if (!init_cwd || !init_cwd.includes('/packages/sdks/output/')) {
    throw new Error(
      `build-inline-fns script must run from one of the SDKs root. Instead it was called from: "${init_cwd}".`
    );
  }

  const foundFiles = glob.globSync(init_cwd + '/src/**/*/inlined-fns.*', {
    sync: true,
  });

  if (foundFiles.length !== 2) {
    throw new Error(
      `Number of inline functions files found ${foundFiles.length} is not equal to 2. Expected only two files named \`inlined-fns.ts\` containing stringified function exports.`
    );
  }

  const inlineFnsFiles = foundFiles.map((file) => {
    if (!file || !fs.existsSync(file)) {
      throw new Error(
        'No inline functions file found. Expected a file named `inlined-fns.ts` containing stringified function exports.'
      );
    }

    console.log(`Found inline functions file at: "${file}".`);

    return file;
  });

  /**
   *
   * @param {babel.NodePath<babel.types.MemberExpression>} path
   */
  const checkIsToStringExport = (path) => {
    const prop = path.node?.property;
    if (!t.isExpression(prop)) return false;
    if (prop.name !== 'toString') return false;

    // make sure we dont modify any other `toString()` calls
    if (!path.findParent((p) => p.isExportNamedDeclaration())) return false;

    return true;
  };

  for (const inlineFnsFile of inlineFnsFiles) {
    const newFile = babel.transformFileSync(inlineFnsFile, {
      plugins: [
        [tsPlugin, { isTSX: true }],
        /** @returns {InlinePlugin} */
        () => ({
          visitor: {
            MemberExpression(path, _context) {
              if (!checkIsToStringExport(path)) return;

              const nameOfFn = path.node.object.name;

              const program = path.findParent((p) => p.isProgram());

              /**
               * @type {babel.NodePath<babel.types.FunctionDeclaration> | null}
               */
              let fnNode = null;

              program.traverse({
                FunctionDeclaration(path) {
                  if (nameOfFn !== path.node.id.name) return;

                  fnNode = path;
                },
              });

              if (!fnNode)
                throw new Error('No function node found for ' + nameOfFn);

              const generated = generate.default(fnNode.node).code;
              const stringifiedNode = babel.transformSync(generated, {
                filename: 'generated.js',
                configFile: false,
                babelrc: false,
                comments: false,
                presets: [[tsPreset, { isTSX: true, allExtensions: true }]],
              }).code;

              const parentToReplace = path.findParent((p) =>
                t.isVariableDeclarator(p.parent)
              );

              parentToReplace.replaceWith(t.stringLiteral(stringifiedNode));

              // Only remove the function if it's not directly exported
              const exportParent = fnNode.findParent((p) =>
                p.isExportNamedDeclaration()
              );
              if (
                !exportParent ||
                !t.isFunctionDeclaration(exportParent.node.declaration)
              ) {
                fnNode.remove();
              }
            },
          },
        }),
      ],
    });

    console.log('Writing inline functions to file...');

    fs.writeFileSync(inlineFnsFile, newFile.code);
  }

  console.log('Done building inline functions.');
};

buildInlineFns();
