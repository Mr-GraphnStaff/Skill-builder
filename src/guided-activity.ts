import type { GuidedAction, GuidedState } from './guided-contract.js';

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
    reloadFile: 'Loading the saved file…', check: 'Running a structural sanity check…',
    preparePublish: 'Comparing your changes and preparing the sharing summary…',
    savePackage: 'Checking and saving your local package…', publish: 'Preparing your submission…',
    discoverRepositories: 'Finding repositories you can connect…', connectRepository: 'Checking the repository connection…',
    verifyRepository: 'Verifying local and remote skills repositories…', setRepositoryFolder: 'Choose the local skills project folder in VS Code…',
    pullRepository: 'Pulling the registered repository…', openRepositorySkill: 'Choose a skill folder from the pulled repository…',
    createRepository: 'Creating the repository you confirmed…', revealPackage: 'Opening the package folder…',
    loadReviewers: 'Finding eligible reviewers…', checkPullRequests: 'Checking recorded pull requests…',
    checkPullRequest: 'Checking this pull request…', createPullRequest: 'Finding or creating this pull request…',
    mergePullRequest: 'Verifying and merging this submission, then removing its merged branch…',
    requestReviewer: 'Sending the review request you confirmed…', connectGitHub: 'Waiting for GitHub sign-in in VS Code…',
    openPullRequest: 'Opening the recorded pull request…', openLink: 'Opening the selected link…',
    edit: 'Returning to your draft…', back: 'Opening the previous step…', startAnother: 'Opening your skills…',
    showCreate: 'Opening a new draft form…', setTarget: 'Updating the intended application…'
  };
  return labels[action] ?? 'Working on your request…';
}

export function actionNeedsInput(action: GuidedAction): boolean {
  return ['setRepositoryFolder', 'openRepositorySkill', 'chooseWorkspace', 'openPackage', 'openFolder', 'addFile', 'connectGitHub'].includes(action);
}

/** Navigation guidance follows the actual result, including partial uploads. */
export function nextActivityMessage(state: GuidedState): string {
  if (state.error) return 'Next: read the error details before retrying.';
  if (state.receipt?.cleanupError) return 'Next: inspect the cleanup notice; the saved upload remains recorded.';
  if (state.step === 'done') {
    if (state.receipt?.local) return 'Next: open the saved package folder or start another skill.';
    if (state.receipt?.pr?.error || state.receipt?.pr?.creationUncertain) return 'Next: use Check PRs to confirm the existing upload.';
    return state.receipt?.pr?.number ? 'Next: open the recorded pull request and review this submission.' : 'Next: inspect the uploaded review branch.';
  }
  if (state.step === 'publish') return 'Next: review the sharing summary and choose how to save or submit.';
  if (state.step === 'check') return state.check?.valid ? 'Next: review the check results and prepare the sharing summary.' : 'Next: review the findings and return to the draft.';
  if (state.step === 'edit') return 'Next: edit the draft or run its structural check.';
  return 'Next: create or open a skill, or choose a recorded submission.';
}
