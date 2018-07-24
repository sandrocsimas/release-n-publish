'use strict';

const path = require('path');
const {commands, release} = require('../lib');

const WORKING_DIR = path.resolve();

async function lintProject() {
  commands.log('Linting project...');
  await commands.exec('npm run lint', WORKING_DIR);
}

// Run this if call directly from command line
if (require.main === module) {
  release.setWorkingDir(WORKING_DIR);
  release.setLintTask(lintProject);
  release.run(process.argv[2]);
}
