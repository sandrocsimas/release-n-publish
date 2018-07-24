'use strict';

const {commands, release} = require('../lib');
const path = require('path');

const WORKING_DIR = path.resolve();

async function lintProject() {
  commands.log('Linting project...');
  await commands.exec('npm run lint', WORKING_DIR);
}

async function buildProject() {
  // Nothing to do...
}

// Run this if call directly from command line
if (require.main === module) {
  release.withWorkingDir(WORKING_DIR);
  release.withLintTask(lintProject);
  release.withBuildTask(buildProject);
  release.run(process.argv[2], process.argv[3]);
}
