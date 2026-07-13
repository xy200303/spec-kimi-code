import * as vscode from 'vscode';

const SPECS_DIRECTORY = 'specs';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('kimiSpecRuns', new SpecRunsProvider()),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('kimiSpec.openLatestRun', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (folder === undefined) return;
      const specs = vscode.Uri.joinPath(folder.uri, SPECS_DIRECTORY);
      const runs = await vscode.workspace.fs.readDirectory(specs).catch(() => []);
      const latest = runs.filter(([, type]) => type === vscode.FileType.Directory).at(-1)?.[0];
      if (latest === undefined) {
        void vscode.window.showInformationMessage('No project-local Kimi spec runs found.');
        return;
      }
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(specs, latest, 'spec.md'));
    }),
  );
}

class SpecRunsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
    return item;
  }

  async getChildren(item?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (item?.resourceUri !== undefined) return ['spec.md', 'design.md', 'delivery.md', 'delivery.json'].map((name) => {
      const child = new vscode.TreeItem(name);
      child.command = { command: 'vscode.open', title: `Open ${name}`, arguments: [vscode.Uri.joinPath(item.resourceUri!, name)] };
      return child;
    });
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder === undefined) return [];
    const specs = vscode.Uri.joinPath(folder.uri, SPECS_DIRECTORY);
    const runs = await vscode.workspace.fs.readDirectory(specs).catch(() => []);
    return runs
      .filter(([, type]) => type === vscode.FileType.Directory)
      .map(([run]) => {
        const item = new vscode.TreeItem(run, vscode.TreeItemCollapsibleState.Collapsed);
        item.resourceUri = vscode.Uri.joinPath(specs, run);
        return item;
      });
  }
}
