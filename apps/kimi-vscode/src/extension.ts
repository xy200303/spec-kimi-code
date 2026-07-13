import * as vscode from 'vscode';

const SPECS_DIRECTORY = 'specs';

async function readDirectoryOrEmpty(uri: vscode.Uri): Promise<Array<[string, vscode.FileType]>> {
  try {
    return await vscode.workspace.fs.readDirectory(uri);
  } catch {
    return [];
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SpecRunsProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('kimiSpecRuns', provider),
    vscode.commands.registerCommand('kimiSpec.refreshRuns', () => provider.refresh()),
    watchSpecRuns(provider),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('kimiSpec.openLatestRun', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (folder === undefined) return;
      const specs = vscode.Uri.joinPath(folder.uri, SPECS_DIRECTORY);
      const runs = await readDirectoryOrEmpty(specs);
      const latest = runs
        .filter(([, type]) => type === vscode.FileType.Directory)
        .map(([name]) => name)
        .sort((left, right) => right.localeCompare(left))[0];
      if (latest === undefined) {
        void vscode.window.showInformationMessage('No project-local Kimi spec runs found.');
        return;
      }
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(specs, latest, 'spec.md'));
    }),
  );
}

function watchSpecRuns(provider: SpecRunsProvider): vscode.FileSystemWatcher {
  const watcher = vscode.workspace.createFileSystemWatcher(`${SPECS_DIRECTORY}/**`);
  const refresh = () => provider.refresh();
  watcher.onDidCreate(refresh);
  watcher.onDidChange(refresh);
  watcher.onDidDelete(refresh);
  return watcher;
}

class SpecRunsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
    return item;
  }

  async getChildren(item?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (item?.resourceUri !== undefined) return this.getRunDocuments(item.resourceUri);
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder === undefined) return [];
    const specs = vscode.Uri.joinPath(folder.uri, SPECS_DIRECTORY);
    const runs = await readDirectoryOrEmpty(specs);
    return runs
      .filter(([, type]) => type === vscode.FileType.Directory)
      .map(([run]) => run)
      .sort((left, right) => right.localeCompare(left))
      .map((run) => {
        const item = new vscode.TreeItem(run, vscode.TreeItemCollapsibleState.Collapsed);
        item.resourceUri = vscode.Uri.joinPath(specs, run);
        return item;
      });
  }

  private async getRunDocuments(run: vscode.Uri): Promise<vscode.TreeItem[]> {
    const documents = await readDirectoryOrEmpty(run);
    const documentNames = new Set(
      documents
        .filter(([, type]) => type === vscode.FileType.File)
        .map(([name]) => name),
    );
    return ['spec.md', 'design.md', 'delivery.md', 'delivery.json']
      .filter((name) => documentNames.has(name))
      .map((name) => {
        const uri = vscode.Uri.joinPath(run, name);
        const child = new vscode.TreeItem(name);
        child.command = { command: 'vscode.open', title: `Open ${name}`, arguments: [uri] };
        child.resourceUri = uri;
        return child;
      });
  }
}
