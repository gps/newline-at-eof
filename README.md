# newline-at-eof

A GitHub Action that ensures that files end with exactly 1 newline at end of file.

This Action runs only on files modified in `Pull Requests`. It will fail if executed on other events.

## Inputs

### `GH_TOKEN`

The GitHub token used to authenticate with GitHub.

**Required**

### `IGNORE_FILE_PATTERNS`

Path to ignore while checkking for newline at EOF.

**Optional**

### `COMMIT_MESSAGE`

Commit message to post when making a fix commit

**Required**

**Default Value**

If unspecified, it defaults to the following message:

"Fix formatting"

## Example Usage

```yml
- name: Check newline at EOF
  uses: gps/newline-at-eof@master
  with:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    IGNORE_FILE_PATTERNS: |
      [
        "dist/.*",
        "package-lock.json"
      ]
    COMMIT_MESSAGE: 'Fix formatting'
```
