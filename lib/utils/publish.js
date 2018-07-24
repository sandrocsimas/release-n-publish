'use strict';

const commands = require('./commands');
const fs = require('fs');
const path = require('path');
const util = require('util');

const ECR_REPOSITORY_URL = '554511234717.dkr.ecr.us-west-1.amazonaws.com';
const ECR_REPOSITORY_NAMESPACE = 'ayro';
const ECR_REPOSITORY_REGION = 'us-west-1';

const readFile = util.promisify(fs.readFile);

let workingDir;
let lintTask;
let buildTask;
let beforePublishTask;
let publishTask;
let dockerProject;
let npmProject;

async function exec(command, dir) {
  return commands.exec(command, dir || workingDir);
}

async function getPackageJson() {
  const packageFile = path.join(workingDir, 'package.json');
  return JSON.parse(await readFile(packageFile, 'utf8'));
}

async function checkoutTag(version) {
  commands.log(`Checking out the tag ${version}...`);
  await exec(`git checkout ${version}`);
}

async function buildDockerImage() {
  const packageJson = await getPackageJson();
  commands.log('Building image...');
  await exec(`docker build -t ${packageJson.name} .`);
  commands.log('Tagging image...');
  await exec(`docker tag ${packageJson.name}:latest ${ECR_REPOSITORY_URL}/${ECR_REPOSITORY_NAMESPACE}/${packageJson.name}:latest`);
}

async function publishToECR() {
  const packageJson = await getPackageJson();
  commands.log('Signing in to Amazon ECR...');
  await exec(`eval $(aws ecr get-login --no-include-email --region ${ECR_REPOSITORY_REGION})`);
  commands.log('Publishing to Amazon ECR...');
  await exec(`docker push ${ECR_REPOSITORY_URL}/${ECR_REPOSITORY_NAMESPACE}/${packageJson.name}:latest`);
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
  if (!buildTask) {
    commands.logError('Build task is required');
    process.exit(1);
  }
  if (!dockerProject && !npmProject && !publishTask) {
    commands.logError('Publish task is required');
    process.exit(1);
  }
}

exports.withWorkingDir = (dir) => {
  workingDir = dir;
};

exports.withLintTask = (task) => {
  lintTask = task;
};

exports.withBuildTask = (task) => {
  buildTask = task;
};

exports.withBeforePublishTask = (task) => {
  beforePublishTask = task;
};

exports.withPublishTask = (task) => {
  publishTask = task;
};

exports.isDockerProject = (value) => {
  dockerProject = value;
};

exports.isNpmProject = (value) => {
  npmProject = value;
};

exports.run = async () => {
  try {
    validateProgram();
    const packageJson = await getPackageJson();
    const {version} = packageJson;
    commands.log(`Publishing version ${version}...`);
    await checkoutTag(version);
    if (lintTask) {
      await lintTask();
    }
    await buildTask();
    if (dockerProject) {
      await buildDockerImage();
    }
    if (beforePublishTask) {
      await beforePublishTask();
    }
    if (dockerProject) {
      await publishToECR();
    }
    if (npmProject) {
      await publishToNpm();
    }
    if (publishTask) {
      await publishTask();
    }
    await checkoutTag('master');
    commands.log(`Version ${version} published with success!`);
  } catch (err) {
    commands.logError(err);
    await checkoutTag('master');
    process.exit(1);
  }
};
