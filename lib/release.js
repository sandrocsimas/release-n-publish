'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const semver = require('semver');
const commands = require('./commands');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

let workingDir;
let beforeVersionUpdateTask;
let afterVersionUpdateTask;
let lintTask;
let buildTask;

function isValidVersionType(versionType) {
  return ['major', 'minor', 'patch'].includes(versionType);
}

function validateProgram(versionArg) {
  if (!workingDir) {
    throw new Error('Working dir is required');
  }
  if (!isValidVersionType(versionArg) && !semver.valid(versionArg)) {
    throw new Error('Invalid version argument');
  }
}

async function exec(command, dir) {
  return commands.exec(command, dir || workingDir);
}

async function readPackageJson() {
  const packageFile = path.join(workingDir, 'package.json');
  return JSON.parse(await readFile(packageFile, 'utf8'));
}

async function writePackageJson(packageJson) {
  const packageFile = path.join(workingDir, 'package.json');
  await writeFile(packageFile, JSON.stringify(packageJson, null, 2));
}

async function getNextVersion(versionArg) {
  const packageJson = await readPackageJson();
  return isValidVersionType(versionArg) ? semver.inc(packageJson.version, versionArg) : versionArg;
}

async function checkoutMaster() {
  commands.log('Checking out master branch...');
  await exec('git checkout master');
}

async function updateMaster() {
  commands.log('Updating master branch...');
  await exec('git pull origin master');
}

async function updateVersion(nextVersion) {
  commands.log('Updating version...');
  const packageJson = await readPackageJson();
  commands.log(`  Current version is ${packageJson.version}`);
  commands.log(`  Next version is ${nextVersion}`);
  packageJson.version = nextVersion;
  await writePackageJson(JSON.stringify(packageJson, null, 2));
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

exports.setWorkingDir = (dir) => {
  workingDir = dir;
};

exports.setBeforeVersionUpdateTask = (task) => {
  beforeVersionUpdateTask = task;
};

exports.setAfterVersionUpdateTask = (task) => {
  afterVersionUpdateTask = task;
};

exports.setLintTask = (task) => {
  lintTask = task;
};

exports.setBuildTask = (task) => {
  buildTask = task;
};

exports.run = async (versionArg) => {
  try {
    validateProgram(versionArg);
    const version = await getNextVersion(versionArg);
    await checkoutMaster();
    await updateMaster();
    if (lintTask) {
      await lintTask();
    }
    if (beforeVersionUpdateTask) {
      await beforeVersionUpdateTask(version);
    }
    await updateVersion(version);
    if (afterVersionUpdateTask) {
      await afterVersionUpdateTask(version);
    }
    if (buildTask) {
      await buildTask();
    }
    commands.log(`Releasing version ${version} to remote...`);
    await commitFiles(version);
    await pushFiles();
    await createTag(version);
    await pushTag();
    commands.log(`Version ${version} released with success!`);
  } catch (err) {
    commands.logError(err);
    await checkoutMaster();
  }
};
