import { fetchJson } from '../verify/fetch-helper.js';
import { DEFAULT_PAGE_SIZE, fetchAllPages } from '../verify/pagination.js';
import { resolveSandboxContext } from '../sandbox/context.js';

const GITLAB_SEARCH_PREFIXES = [
  'develop',
  'feature',
  'release',
  'hotfix',
  'bugfix',
  'fix',
  'test',
  'prod',
  'staging',
  'uat',
  'v',
  'main',
  'master',
];

function sortBranchNames(names) {
  return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function mapBranchNames(data) {
  return (Array.isArray(data) ? data : []).map((item) => item.name).filter(Boolean);
}

function githubHeaders(credential) {
  return {
    Authorization: `Bearer ${credential.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function gitlabHeaders(credential) {
  return {
    'PRIVATE-TOKEN': credential.token,
    Accept: 'application/json',
  };
}

async function listGithubBranches(credential, apiBase, owner, repo) {
  const names = await fetchAllPages(
    (page) => `${apiBase}/repos/${owner}/${repo}/branches?per_page=${DEFAULT_PAGE_SIZE}&page=${page}`,
    { headers: githubHeaders(credential) },
    mapBranchNames,
  );
  return sortBranchNames(names);
}

async function listGiteeBranches(credential, apiBase, owner, repo) {
  const names = await fetchAllPages(
    (page) => {
      const url = new URL(`${apiBase}/repos/${owner}/${repo}/branches`);
      url.searchParams.set('access_token', credential.token);
      url.searchParams.set('page', String(page));
      url.searchParams.set('per_page', String(DEFAULT_PAGE_SIZE));
      return url.toString();
    },
    { headers: { Accept: 'application/json' } },
    mapBranchNames,
  );
  return sortBranchNames(names);
}

async function fetchGitlabBranchNames(apiBase, encodedProject, credential, query = '') {
  const suffix = query ? `&${query}` : '';
  return fetchAllPages(
    (page) => `${apiBase}/projects/${encodedProject}/repository/branches?per_page=${DEFAULT_PAGE_SIZE}&page=${page}${suffix}`,
    { headers: gitlabHeaders(credential) },
    mapBranchNames,
  );
}

async function listGitlabBranches(credential, apiBase, fullPath) {
  const encoded = encodeURIComponent(fullPath);
  const names = [];

  try {
    names.push(...await fetchGitlabBranchNames(
      apiBase,
      encoded,
      credential,
      `regex=${encodeURIComponent('.*')}`,
    ));
  } catch {
    // Older GitLab instances may not support regex filtering.
  }

  names.push(...await fetchGitlabBranchNames(apiBase, encoded, credential));

  const prefixResults = await Promise.all(
    GITLAB_SEARCH_PREFIXES.map(async (prefix) => {
      try {
        return await fetchGitlabBranchNames(
          apiBase,
          encoded,
          credential,
          `search=${encodeURIComponent(prefix)}`,
        );
      } catch {
        return [];
      }
    }),
  );
  names.push(...prefixResults.flat());

  return sortBranchNames(names);
}

/**
 * @param {string} repositoryId
 */
export async function listRepositoryBranches(repositoryId) {
  const { repository, credential, apiBase } = await resolveSandboxContext(repositoryId);

  switch (repository.platform) {
    case 'github':
      return listGithubBranches(credential, apiBase, repository.owner, repository.repo);
    case 'gitee':
      return listGiteeBranches(credential, apiBase, repository.owner, repository.repo);
    case 'gitlab':
      return listGitlabBranches(credential, apiBase, repository.fullPath);
    default:
      throw new Error(`不支持的平台: ${repository.platform}`);
  }
}
