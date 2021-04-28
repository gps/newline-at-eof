const exec = require('@actions/exec');
const core = require('@actions/core');
const github = require('@actions/github');
const { parse: gitDiffParser } = require('what-the-diff');
const fs = require('fs-extra');
const simpleGit = require('simple-git');
const env = process.env;

function matchExact(r, str) {
  let match = str.match(r);
  return match && str === match[0];
}

function fixNewLineEOF(b) {
  // Replace all trailing whitespaces
  b = b.replace(/[ \t\n]*$/, '\n');

  if (b.length === 1) {
    // if the remaining character is a whitespace
    if (/[ \t\n]*$/.test(b)) {
      return '';
    } else {
      return b + '\n';
    }
  }
  return b;
}

async function getChangedFilesPaths() {
  const octokit = github.getOctokit(token);
  const { context = {} } = github;
  const { pull_request } = context.payload;

  const owner = env.GITHUB_REPOSITORY.split('/')[0];
  const repo = env.GITHUB_REPOSITORY.split('/')[1];

  const { data: pullRequestDiff } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pull_request.number,
    mediaType: {
      format: 'diff'
    }
  });

  const parsedDiff = gitDiffParser(pullRequestDiff);

  const changedFilePaths = parsedDiff.map((e) => {
    return e['newPath'].replace('b/', '');
  });

  return changedFilePaths;
}

async function checkoutToBranch(branch) {
  const url = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}.git`.replace(
    /^https:\/\//,
    `https://x-access-token:${token}@`
  );

  const git = simpleGit();
  await git.addRemote('repo', url);
  await git.fetch('repo');
  await git.checkout(branch);
  return git;
}

function fixFiles(filesToCheck) {
  const filesToCommit = [];

  for (let i = 0; i < filesToCheck.length; i++) {
    if (filesToCheck[i] !== null) {
      const data = fs.readFileSync(filesToCheck[i], {
        encoding: 'utf8',
        flag: 'r'
      });
      const fixedData = fixNewLineEOF(data);
      if (data !== fixedData) {
        filesToCommit.push(filesToCheck[i]);
        fs.writeFileSync(filesToCheck[i], fixedData, 'utf8');
      }
    }
  }

  return filesToCommit;
}

async function commitChanges(filesToCommit, commitMessage, git, branch) {
  const diff = await exec.exec('git', ['diff', '--quiet'], {
    ignoreReturnCode: true
  });

  if (diff) {
    await core.group('push changes', async () => {
      await git.addConfig(
        'user.email',
        `${env.GITHUB_ACTOR}@users.noreply.github.com`
      );
      await git.addConfig('user.name', env.GITHUB_ACTOR);
      await git.add(filesToCommit);
      await git.commit(commitMessage);
      await git.push('repo', branch);
    });
  } else {
    console.log('No changes to make');
  }
}

async function run() {
  const token = core.getInput('GH_TOKEN');
  let ignorePaths = core.getInput('IGNORE_FILE_PATTERNS');
  let commitMessage = core.getInput('COMMIT_MESSAGE');

  if (!ignorePaths) {
    ignorePaths = [];
  } else {
    ignorePaths = JSON.parse(ignorePaths);
  }
  core.info('Ignore File Patterns: ' + JSON.stringify(ignorePaths));

  if (!commitMessage) {
    commitMessage = 'Fix formatting';
  }

  try {
    // Extract branch name if pull request else break execution.
    let branch;
    if (github.context.eventName == 'pull_request') {
      branch = github.context.payload.pull_request.head.ref;
    } else {
      core.error('This action will only work on Pull Requests. Exiting.');
      return;
    }

    const git = await checkoutToBranch(branch);

    // Extract files that changed in PR.
    const changedFilePaths = await getChangedFilesPaths();

    core.info('Changed files paths: ' + JSON.stringify(changedFilePaths));

    // Remove files matching ignore paths regex
    const filesToCheck = changedFilePaths.map((e) => {
      for (let i = 0; i < ignorePaths.length; i++) {
        if (matchExact(ignorePaths[i], e)) {
          return null;
        }
      }
      return e;
    });

    core.info('Files to check: ' + JSON.stringify(filesToCheck));

    // Store modified files
    const filesToCommit = fixFiles(filesToCheck);

    // Log Changed files
    core.info('Files to commit: ' + JSON.stringify(filesToCommit));

    // Generate DIff and commit changes
    await commitChanges(filesToCommit, commitMessage, git, branch);
  } catch (error) {
    core.setFailed(error);
  }
}

run();
