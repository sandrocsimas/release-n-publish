'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const semver = require('semver');
const commands = require('./commands');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

let workingDir;
let distFile;
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

async function readDistJson() {
  const distFilePath = path.join(workingDir, distFile || 'package.json');
  return JSON.parse(await readFile(distFilePath, 'utf8'));
}

async function writeDistJson(distJson) {
  const distFilePath = path.join(workingDir, distFile || 'package.json');
  await writeFile(distFilePath, JSON.stringify(distJson, null, 2));
}

async function getNextVersion(distJson, versionArg) {
  return isValidVersionType(versionArg) ? semver.inc(distJson.version, versionArg) : versionArg;
}

async function checkoutMaster() {
  commands.log('Checking out master branch...');
  await exec('git checkout master');
}

async function updateMaster() {
  commands.log('Updating master branch...');
  await exec('git pull origin master');
}

async function updateVersion(distJson, nextVersion) {
  commands.log('Updating version...');
  commands.log(`  Current version is ${distJson.version}`);
  commands.log(`  Next version is ${nextVersion}`);
  distJson.version = nextVersion;
  await writeDistJson(distJson);
  await exec('npm install');
  return nextVersion;
}

async function commitFiles(distJson, version) {
  commands.log('Committing files...');
  await exec('git add --all');
  await exec(`git commit -am "Release ${distJson.name}-${version}"`);
}

async function pushFiles() {
  commands.log('Pushing files...');
  await exec('git push origin master');
}

async function createTag(distJson, version) {
  commands.log(`Creating tag ${distJson.name}-${distJson.version}...`);
  await exec(`git tag ${distJson.name}-${distJson.version}`);
}

async function pushTag() {
  commands.log('Pushing tag...');
  await exec('git push --tags');
}

exports.setWorkingDir = (dir) => {
  workingDir = dir;
};

exports.setDistFile = (file) => {
  distFile = file;
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
    const distJson = await readDistJson();
    const version = await getNextVersion(distJson, versionArg);
    await checkoutMaster();
    await updateMaster();
    if (lintTask) {
      await lintTask();
    }
    if (beforeVersionUpdateTask) {
      await beforeVersionUpdateTask(version);
    }
    await updateVersion(distJson, version);
    if (afterVersionUpdateTask) {
      await afterVersionUpdateTask(version);
    }
    if (buildTask) {
      await buildTask();
    }
    commands.log(`Releasing version ${version} to remote...`);
    await commitFiles(distJson, version);
    await pushFiles();
    await createTag(distJson, version);
    await pushTag();
    commands.log(`Version ${version} released with success!`);
  } catch (err) {
    commands.logError(err);
    await checkoutMaster();
  }
};
