'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const commands = require('./commands');

const readFile = util.promisify(fs.readFile);

let workingDir;
let distFile;
let lintTask;
let buildTask;
let beforePublishTask;
let publishTask;
let afterPublishTask;
let dockerProject;
let npmProject;

async function exec(command) {
  return commands.exec(command, workingDir);
}

async function readDistJson() {
  const distFilePath = path.join(workingDir, distFile || 'package.json');
  return JSON.parse(await readFile(distFilePath, 'utf8'));
}

async function checkoutTag(tag) {
  commands.log(`Checking out the tag ${tag}...`);
  await exec(`git checkout ${tag}`);
}

async function buildDockerImage(distJson) {
  commands.log('Building image...');
  await exec(`docker build -t ${distJson.name} -f ${path.join(workingDir, dockerProject.dockerFile || 'Dockerfile')} .`);
}

async function tagDockerImageToECR(distJson) {
  commands.log('Tagging image...');
  await exec(`docker tag ${distJson.name}:latest ${dockerProject.ecr.repository.url}/${dockerProject.ecr.repository.namespace}/${distJson.name}:latest`);
}

async function publishToECR(distJson) {
  commands.log('Signing in to Amazon ECR...');
  let ecrLogin = 'aws ecr get-login-password';
  if (dockerProject.ecr.region) {
    ecrLogin += ` --region ${dockerProject.ecr.region}`;
  }
  if (dockerProject.ecr.profile) {
    ecrLogin += ` --profile ${dockerProject.ecr.profile}`;
  }
  ecrLogin += ` | docker login --username AWS --password-stdin ${dockerProject.ecr.repository.url}`;
  await exec(ecrLogin);
  commands.log('Publishing to Amazon ECR...');
  await exec(`docker push ${dockerProject.ecr.repository.url}/${dockerProject.ecr.repository.namespace}/${distJson.name}:latest`);
}

async function publishToNpm() {
  commands.log('Publishing to Npm...');
  await commands.exec('npm publish');
}

function validateProgram() {
  if (!workingDir) {
    throw new Error('Working dir is required');
  }
  if (!dockerProject && !npmProject && !publishTask) {
    throw new Error('Publish task is required');
  }
}

exports.setWorkingDir = (dir) => {
  workingDir = dir;
};

exports.setDistFile = (file) => {
  distFile = file;
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
    const distJson = await readDistJson();
    commands.log(`Publishing version ${distJson.version}...`);
    await checkoutTag(`${distJson.name}-${distJson.version}`);
    if (lintTask) {
      await lintTask();
    }
    if (buildTask) {
      await buildTask();
    }
    if (dockerProject) {
      await buildDockerImage(distJson);
    }
    if (dockerProject && dockerProject.ecr) {
      await tagDockerImageToECR(distJson);
    }
    if (beforePublishTask) {
      await beforePublishTask();
    }
    if (dockerProject && dockerProject.ecr) {
      await publishToECR(distJson);
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
    commands.log(`Version ${distJson.version} published with success!`);
  } catch (err) {
    commands.logError(err);
    await checkoutTag('master');
  }
};
