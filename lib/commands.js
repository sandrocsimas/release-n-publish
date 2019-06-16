'use strict';

const childProcess = require('child_process');
const chalk = require('chalk');

const $ = this;

function logBuffer(data, buffer) {
  const newBuffer = buffer + data.toString();
  const lines = newBuffer.split('\n');
  for (let i = 0; i < lines.length - 1; i += 1) {
    const line = lines[i];
    $.log(line, false);
  }
  return lines[lines.length - 1];
}

exports.exec = async (command, dir) => {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, {
      shell: true,
      cwd: dir,
    });
    let outBuffer = '';
    let errBuffer = '';
    child.stdout.on('data', (data) => {
      outBuffer = logBuffer(data, outBuffer);
    });
    child.stderr.on('data', (data) => {
      errBuffer = logBuffer(data, errBuffer);
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command "${command}" returned error`));
      }
    });
  });
};

exports.log = (text, colored) => {
  // eslint-disable-next-line no-console
  console.info(colored === false ? text : chalk.green(text));
};

exports.logError = (text, colored) => {
  // eslint-disable-next-line no-console
  console.error(colored === false ? text : chalk.red(text));
};
