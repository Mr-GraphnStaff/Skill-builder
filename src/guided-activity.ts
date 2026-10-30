import type { GuidedAction } from './guided-contract.js';

/** Fixed UI copy, never instructions or text taken from imported packages. */
export function activityForAction(action: GuidedAction): string {
  const labels: Partial<Record<GuidedAction, string>> = {
    ready: 'Opening your workbench…', loadSkills: 'Loading your saved skills…', refresh: 'Refreshing your saved skills…', unloadSkills: 'Clearing the saved skills list…',
    openPackagePath: 'Opening and checking the selected skill package…',
    chooseWorkspace: 'Choose a folder in the VS Code dialog…', openPackage: 'Choose a skill package in the VS Code dialog…',
    openFolder: 'Choose a skill folder in the VS Code dialog…', addFile: 'Choose a supporting file in the VS Code dialog…',
    createSkill: 'Creating your local draft…', resume: 'Opening your saved draft…', restoreVersion: 'Restoring a saved release into a draft…',
    openFile: 'Opening the selected file…', createFile: 'Creating the file…', save: 'Saving your changes locally…',
    restoreEdit: 'Restoring the earlier edit and preserving your current work…', refreshHistory: 'Loading earlier edits…',
    reloadFile: 'Loading the saved file…', check: 'Checking skill files and compatibility…',
    preparePublish: 'Comparing your changes and preparing the sharing summary…',
    savePackage: 'Checking and saving your local package…', publish: 'Preparing your submission…',
    discoverRepositories: 'Finding repositories you can connect…', connectRepository: 'Checking the repository connection…',
    verifyRepository: 'Verifying local and remote skills repositories…', setRepositoryFolder: 'Choose the local skills project folder in VS Code…',
    pullRepository: 'Pulling the registered repository…', openRepositorySkill: 'Choose a skill folder from the pulled repository…',
    createRepository: 'Creating the repository you confirmed…', revealPackage: 'Opening the package folder…',
    loadReviewers: 'Finding eligible reviewers…', checkPullRequests: 'Checking recorded pull requests…',
    checkPullRequest: 'Checking this pull request…', createPullRequest: 'Finding or creating this pull request…',
    requestReviewer: 'Sending the review request you confirmed…', connectGitHub: 'Waiting for GitHub sign-in in VS Code…',
    openPullRequest: 'Opening the recorded pull request…', openLink: 'Opening the selected link…',
    edit: 'Returning to your draft…', back: 'Opening the previous step…', startAnother: 'Opening your skills…',
    showCreate: 'Opening a new draft form…', setTarget: 'Updating compatibility settings…'
  };
  return labels[action] ?? 'Working on your request…';
}

export function actionNeedsInput(action: GuidedAction): boolean {
  return ['setRepositoryFolder', 'openRepositorySkill', 'chooseWorkspace', 'openPackage', 'openFolder', 'addFile', 'connectGitHub'].includes(action);
}
