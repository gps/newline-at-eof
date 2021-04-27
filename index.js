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

async function getChangedFilesPaths(pull_request, octokit, owner, repo) {
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

async function run() {
  const token = core.getInput('GH_TOKEN');
  let ignorePaths = core.getInput('IGNORE_PATHS');
  if (!ignorePaths) {
    ignorePaths = [];
  } else {
    ignorePaths = ignorePaths.split(' ');
  }

  core.info('ignorePaths' + JSON.stringify(ignorePaths));
  
  const url = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}.git`.replace(
    /^https:\/\//,
    `https://x-access-token:${token}@`
  );
  
  let branch;
  if (github.context.eventName == 'pull_request') {
    branch = github.context.payload.pull_request.head.ref;
  } else {
    branch = github.context.ref.replace('refs/heads/', '');
  }

  const git = simpleGit();
  await git.addRemote('repo', url);

  const octokit = github.getOctokit(token);
  const { context = {} } = github;
  const { pull_request } = context.payload;

  const owner = env.GITHUB_REPOSITORY.split('/')[0];
  const repo = env.GITHUB_REPOSITORY.split('/')[1];

  const changedFilePaths = await getChangedFilesPaths(
    pull_request,
    octokit,
    owner,
    repo
  );

  core.info('changedFilePaths ' + JSON.stringify(changedFilePaths));

  // Removec files matching ignore paths regex
  let filesToCheck = changedFilePaths.map((e) => {
    for (let i = 0; i < ignorePaths.length; i++) {
      if (matchExact(ignorePaths[i], e)) {
        return null;
      }
    }
    return e;
  });

  core.info('filesToCheck ' + JSON.stringify(filesToCheck));

  // Store modified files

  const filesToCommit = [];

  // Perform EOF newline check
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

  // Log Changed files
  core.info('filesToCommit: ' + JSON.stringify(filesToCommit));

  // Generate DIff and commit changes
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
      await git.commit('Fixed Trailing Whitespaces and EOF Newline');
      await git.push('repo', branch);
    });
  } else {
    console.log('No changes to make');
  }
}

run();
