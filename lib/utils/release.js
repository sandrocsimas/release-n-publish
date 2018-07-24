'use strict';

const commands = require('./commands');
const fs = require('fs');
const path = require('path');
const util = require('util');
const semver = require('semver');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

let workingDir;
let afterVersionUpdateTask;
let lintTask;
let buildTask;

function isValidVersionType(versionType) {
  const versionTypes = ['major', 'minor', 'patch'];
  return ['major', 'minor', 'patch'].includes(versionType);
}

async function exec(command, dir) {
  return commands.exec(command, dir || workingDir);
}

async function checkoutMaster() {
  commands.log('Checking out master branch...');
  await exec('git checkout master');
}

async function updateMaster() {
  commands.log('Updating master branch...');
  await exec('git pull origin master');
}

async function updateVersion(versionArg) {
  commands.log('Updating version...');
  const packageFile = path.join(workingDir, 'package.json');
  const packageJson = JSON.parse(await readFile(packageFile, 'utf8'));
  commands.log(`  Current version is ${packageJson.version}`);
  const nextVersion = isValidVersionType(versionArg) ? semver.inc(packageJson.version, versionArg) : versionArg;
  commands.log(`  Next version is ${nextVersion}`);
  packageJson.version = nextVersion;
  await writeFile(packageFile, JSON.stringify(packageJson, null, 2));
  await exec('npm install');
  return nextVersion;
}

async function commitFiles(version) {
  commands.log('Committing files...');
  await exec('git add --all');
  await exec(`git commit -am "Release ${version}"`);
}

async function pushFiles() {
  commands.log('Pushing files to remote...');
  await exec('git push origin master');
}

async function createTag(version) {
  commands.log(`Creating tag ${version}...`);
  await exec(`git tag ${version}`);
}

async function pushTag() {
  commands.log('Pushing tag to remote...');
  await exec('git push --tags');
}

function validateProgram(versionArg) {
  if (!workingDir) {
    commands.logError('Working dir is required');
    process.exit(1);
  }
  if (!buildTask) {
    commands.logError('Build task is required');
    process.exit(1);
  }
  const validVersionType = isValidVersionType(versionArg);
  const validVersion = semver.valid(versionArg);
  if (!validVersionType && !validVersion) {
    commands.logError('Invalid version argument');
    process.exit(1);
  }
}

exports.withWorkingDir = (dir) => {
  workingDir = dir;
};

exports.withAfterVersionUpdateTask = (task) => {
  afterVersionUpdateTask = task;
};

exports.withLintTask = (task) => {
  lintTask = task;
};

exports.withBuildTask = (task) => {
  buildTask = task;
};

exports.run = async (versionArg) => {
  try {
    validateProgram(versionArg);
    await checkoutMaster();
    await updateMaster();
    if (lintTask) {
      await lintTask();
    }
    const version = await updateVersion(versionArg);
    if (afterVersionUpdateTask) {
      await afterVersionUpdateTask(version);
    }
    await buildTask();
    commands.log(`Releasing version ${version} to remote...`);
    await commitFiles(version);
    await pushFiles();
    await createTag(version);
    await pushTag();
    commands.log(`Version ${version} released with success!`);
  } catch (err) {
    commands.logError(err);
    await checkoutMaster();
    process.exit(1);
  }
};
