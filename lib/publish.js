'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const commands = require('./commands');

const readFile = util.promisify(fs.readFile);

let workingDir;
let lintTask;
let buildTask;
let beforePublishTask;
let publishTask;
let afterPublishTask;
let dockerProject;
let npmProject;

async function exec(command, dir) {
  return commands.exec(command, dir || workingDir);
}

async function readPackageJson() {
  const packageFile = path.join(workingDir, 'package.json');
  return JSON.parse(await readFile(packageFile, 'utf8'));
}

async function checkoutTag(packageJson) {
  commands.log(`Checking out the tag ${packageJson.version}...`);
  await exec(`git checkout ${packageJson.version}`);
}

async function buildDockerImage() {
  const packageJson = await readPackageJson();
  commands.log('Building image...');
  await exec(`docker build -t ${packageJson.name} .`);
}

async function tagDockerImageToECR(packageJson) {
  commands.log('Tagging image...');
  await exec(`docker tag ${packageJson.name}:latest ${dockerProject.ecr.repositoryUrl}/${dockerProject.ecr.repositoryNamespace}/${packageJson.name}:latest`);
}

async function publishToECR() {
  const packageJson = await readPackageJson();
  commands.log('Signing in to Amazon ECR...');
  await exec(`eval $(aws ecr get-login --no-include-email --region ${dockerProject.ecr.region})`);
  commands.log('Publishing to Amazon ECR...');
  await exec(`docker push ${dockerProject.ecr.repositoryUrl}/${dockerProject.ecr.repositoryNamespace}/${packageJson.name}:latest`);
}

async function publishToNpm() {
  commands.log('Publishing to Npm...');
  await commands.exec('npm publish');
}

function validateProgram() {
  if (!workingDir) {
    commands.logError('Working dir is required');
    process.exit(1);
  }
  if (!dockerProject && !npmProject && !publishTask) {
    commands.logError('Publish task is required');
    process.exit(1);
  }
}

exports.setWorkingDir = (dir) => {
  workingDir = dir;
};

exports.setLintTask = (task) => {
  lintTask = task;
};

exports.setBuildTask = (task) => {
  buildTask = task;
};

exports.setBeforePublishTask = (task) => {
  beforePublishTask = task;
};

exports.setPublishTask = (task) => {
  publishTask = task;
};

exports.setAfterPublishTask = (task) => {
  afterPublishTask = task;
};

exports.setDockerProject = (value) => {
  dockerProject = value;
};

exports.setNpmProject = (value) => {
  npmProject = value;
};

exports.run = async () => {
  try {
    validateProgram();
    const packageJson = await readPackageJson();
    commands.log(`Publishing version ${packageJson.version}...`);
    await checkoutTag(packageJson);
    if (lintTask) {
      await lintTask();
    }
    if (buildTask) {
      await buildTask();
    }
    if (dockerProject) {
      await buildDockerImage();
    }
    if (dockerProject && dockerProject.ecr) {
      await tagDockerImageToECR(packageJson);
    }
    if (beforePublishTask) {
      await beforePublishTask();
    }
    if (dockerProject && dockerProject.ecr) {
      await publishToECR();
    }
    if (npmProject) {
      await publishToNpm();
    }
    if (publishTask) {
      await publishTask();
    }
    if (afterPublishTask) {
      await afterPublishTask();
    }
    await checkoutTag('master');
    commands.log(`Version ${packageJson.version} published with success!`);
  } catch (err) {
    commands.logError(err);
    await checkoutTag('master');
    process.exit(1);
  }
};
