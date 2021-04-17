# newline-at-eof

A GitHub Action that ensures that files end with exactly 1 newline at end of file

## Inputs

### `GH_TOKEN`

The GitHub token used to authenticate with GitHub.

**Required**

### `IGNORE_PATHS`

Path to ignore while checkking for newline at EOF.

**Optional**

## Example Usage

```yml
- name: Check newline at EOF
  uses: gps/newline-at-eof@master
  with:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    IGNORE_PATHS: ${{ 'dist/.* package-lock.json' }}
```
