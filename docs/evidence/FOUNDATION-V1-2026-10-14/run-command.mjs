import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run one documented check, preserving its complete output and exit status.
const [label, workingDirectory, command, ...args] = process.argv.slice(2);
if (!label || !workingDirectory || !command || !/^[a-z0-9-]+$/i.test(label)) {
  throw new Error('Usage: node run-command.mjs <label> <cwd> <command> [...args]');
}
const evidenceDirectory = dirname(fileURLToPath(import.meta.url));
const logPath = join(evidenceDirectory, `${label}.log`);
const resultPath = join(evidenceDirectory, `${label}.json`);
if (existsSync(logPath) || existsSync(resultPath)) {
  throw new Error(`Evidence already exists for ${label}; use a new label for a rerun.`);
}
const cwd = resolve(workingDirectory);
const recordedCommand = [command, ...args].join(' ');
let executable = command;
let executableArgs = args;
if (command === 'node') executable = process.execPath;
if (process.platform === 'win32' && ['npm', 'npx'].includes(command)) {
  executable = process.execPath;
  executableArgs = [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', `${command}-cli.js`), ...args];
}
const startedAt = new Date().toISOString();
const log = createWriteStream(logPath, { flags: 'wx' });
log.write(`Command: ${recordedCommand}\nWorking directory: ${cwd}\nStarted (UTC): ${startedAt}\n\n`);
const child = spawn(executable, executableArgs, { cwd, env: process.env, shell: false, windowsHide: true });
let spawnError;
child.stdout.on('data', data => { log.write(data); process.stdout.write(data); });
child.stderr.on('data', data => { log.write(data); process.stderr.write(data); });
child.on('error', error => {
  spawnError = error.message;
  log.write(`${error.message}\n`);
  process.stderr.write(`${error.message}\n`);
});
child.on('close', (code, signal) => {
  const result = { command: recordedCommand, cwd, startedAt, finishedAt: new Date().toISOString(), exitCode: code, signal, ...(spawnError ? { spawnError } : {}) };
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  log.end(`\nExit code: ${code}; signal: ${signal ?? 'none'}\n`);
  process.exitCode = code ?? 1;
});
