import {
  FileView,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import {
  ArchiveEntry,
  ArchiveTreeNode,
  ParsedArchive,
  buildArchiveTree,
  filterArchiveEntries,
  formatBytes,
  parseZipArchive,
} from "./parser";

const VIEW_TYPE_ARCHIVE_VIEWER = "archive-viewer";
const ARCHIVE_EXTENSIONS = ["zip"];

export default class ArchiveViewerPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(
      VIEW_TYPE_ARCHIVE_VIEWER,
      (leaf) => new ArchiveViewerView(leaf),
    );
    this.registerExtensions(ARCHIVE_EXTENSIONS, VIEW_TYPE_ARCHIVE_VIEWER);

    this.addCommand({
      id: "open-current-archive-in-viewer",
      name: "Open current archive in viewer",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!isArchiveFile(file)) return false;

        if (!checking) {
          void this.openArchiveFile(file);
        }
        return true;
      },
    });
  }

  async openArchiveFile(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: VIEW_TYPE_ARCHIVE_VIEWER,
      state: { file: file.path },
      active: true,
    });
  }
}

class ArchiveViewerView extends FileView {
  private archive: ParsedArchive | null = null;
  private filterValue = "";
  private errorMessage = "";

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_ARCHIVE_VIEWER;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Archive viewer";
  }

  getIcon(): string {
    return "archive";
  }

  async onLoadFile(file: TFile): Promise<void> {
    await this.loadArchive(file);
  }

  async onUnloadFile(): Promise<void> {
    this.archive = null;
    this.filterValue = "";
    this.errorMessage = "";
    this.contentEl.empty();
  }

  private async loadArchive(file: TFile): Promise<void> {
    try {
      const data = await this.app.vault.readBinary(file);
      this.archive = parseZipArchive(data);
      this.errorMessage = "";
    } catch (error) {
      this.archive = null;
      this.errorMessage = `Unable to inspect archive: ${getErrorMessage(error)}`;
    }
    this.render();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("archive-viewer");

    const header = container.createDiv({ cls: "archive-viewer__header" });
    this.renderTitle(header);
    this.renderToolbar(header);

    if (!this.file) {
      renderMessage(container, "No archive file is attached to this viewer.");
      return;
    }

    if (!isArchiveFile(this.file)) {
      renderMessage(container, "This viewer only supports .zip files in v0.1.");
      return;
    }

    renderScopeNotice(container);

    if (this.errorMessage) {
      renderMessage(container, this.errorMessage);
      return;
    }

    if (!this.archive) {
      renderMessage(container, "Archive metadata is not loaded.");
      return;
    }

    renderArchiveWarnings(container, this.archive);
    renderSummary(container, this.archive);

    const entries = filterArchiveEntries(this.archive.entries, this.filterValue);
    renderListingNotice(container, entries.length, this.archive.summary.renderedEntryLimit);
    renderArchiveBody(container, entries.slice(0, this.archive.summary.renderedEntryLimit));
  }

  private renderTitle(parent: HTMLElement): void {
    const title = parent.createDiv({ cls: "archive-viewer__title" });
    title.createDiv({
      cls: "archive-viewer__filename",
      text: this.file?.name ?? "ZIP archive",
    });
    title.createDiv({
      cls: "archive-viewer__path",
      text: this.file?.path ?? "",
    });
  }

  private renderToolbar(parent: HTMLElement): void {
    const toolbar = parent.createDiv({ cls: "archive-viewer__toolbar" });

    const searchWrap = toolbar.createDiv({ cls: "archive-viewer__search" });
    setIcon(searchWrap.createSpan({ cls: "archive-viewer__search-icon" }), "search");
    const searchInput = searchWrap.createEl("input", {
      attr: {
        "aria-label": "Filter archive paths and extensions",
        placeholder: "Filter path or .ext",
        spellcheck: "false",
        type: "search",
        value: this.filterValue,
      },
    });
    searchInput.addEventListener("input", () => {
      this.filterValue = searchInput.value;
      this.render();
    });

    const refreshButton = createIconButton(toolbar, "refresh-cw", "Refresh archive metadata");
    refreshButton.addEventListener("click", () => {
      void this.reloadFile();
    });
  }

  private async reloadFile(): Promise<void> {
    if (!this.file) {
      new Notice("No archive file to refresh");
      return;
    }
    await this.loadArchive(this.file);
  }
}

function renderScopeNotice(parent: HTMLElement): void {
  const notice = parent.createDiv({ cls: "archive-viewer__scope" });
  notice.createSpan({ cls: "archive-viewer__scope-label", text: "Inspect only" });
  notice.createSpan({
    cls: "archive-viewer__scope-text",
    text: "Metadata is read from the ZIP central directory; contained files are not opened or extracted.",
  });
}

function renderArchiveWarnings(parent: HTMLElement, archive: ParsedArchive): void {
  const warnings = [
    ...archive.warnings,
    ...archive.entries.flatMap((entry) => entry.warnings.map((warning) => `${entry.path}: ${warning}`)),
  ];
  if (warnings.length === 0) return;

  const box = parent.createDiv({ cls: "archive-viewer__warnings" });
  box.createDiv({ cls: "archive-viewer__warnings-title", text: "Archive warnings" });
  warnings.slice(0, 12).forEach((warning) => {
    box.createDiv({ cls: "archive-viewer__warning", text: warning });
  });
  if (warnings.length > 12) {
    box.createDiv({
      cls: "archive-viewer__warning-more",
      text: `${warnings.length - 12} additional warnings hidden`,
    });
  }
}

function renderSummary(parent: HTMLElement, archive: ParsedArchive): void {
  const summary = parent.createDiv({ cls: "archive-viewer__summary" });
  summary.createSpan({ cls: "archive-viewer__pill", text: `${archive.summary.itemCount} items` });
  summary.createSpan({ cls: "archive-viewer__pill", text: `${archive.summary.fileCount} files` });
  summary.createSpan({ cls: "archive-viewer__pill", text: `${archive.summary.directoryCount} folders` });
  summary.createSpan({
    cls: "archive-viewer__pill",
    text: `${formatBytes(archive.summary.totalUncompressedSize)} uncompressed`,
  });
  summary.createSpan({
    cls: "archive-viewer__pill",
    text: `${formatBytes(archive.summary.totalCompressedSize)} compressed`,
  });
  summary.createSpan({
    cls: "archive-viewer__pill",
    text: `${archive.summary.compressionRatio.toFixed(1)}:1 ratio`,
  });
  if (archive.summary.suspiciousEntryCount > 0) {
    summary.createSpan({
      cls: "archive-viewer__note",
      text: `${archive.summary.suspiciousEntryCount} suspicious entries`,
    });
  }
}

function renderListingNotice(parent: HTMLElement, entryCount: number, renderLimit: number): void {
  if (entryCount <= renderLimit) return;
  parent.createDiv({
    cls: "archive-viewer__notice",
    text: `${renderLimit} of ${entryCount} matching entries are rendered to keep the view responsive.`,
  });
}

function renderArchiveBody(parent: HTMLElement, entries: ArchiveEntry[]): void {
  if (entries.length === 0) {
    renderMessage(parent, "No archive entries match the current filter.");
    return;
  }

  const body = parent.createDiv({ cls: "archive-viewer__body" });
  const treePanel = body.createDiv({ cls: "archive-viewer__tree-panel" });
  treePanel.createDiv({ cls: "archive-viewer__panel-title", text: "Contents tree" });
  renderTree(treePanel, buildArchiveTree(entries));

  const tablePanel = body.createDiv({ cls: "archive-viewer__table-panel" });
  tablePanel.createDiv({ cls: "archive-viewer__panel-title", text: "Entry metadata" });
  renderEntryTable(tablePanel, entries);
}

function renderTree(parent: HTMLElement, root: ArchiveTreeNode): void {
  const tree = parent.createDiv({ cls: "archive-viewer__tree" });
  const children = sortedChildren(root);
  children.forEach((child) => renderTreeNode(tree, child, 0));
}

function renderTreeNode(parent: HTMLElement, node: ArchiveTreeNode, depth: number): void {
  const hasChildren = node.children.size > 0;
  const warningCount = node.entry?.warnings.length ?? 0;
  const details = parent.createEl("details", {
    cls: `archive-viewer__node archive-viewer__node--${node.type}`,
    attr: { open: depth < 2 ? "true" : null },
  });
  details.style.setProperty("--archive-viewer-depth", String(depth));

  const summary = details.createEl("summary", { cls: "archive-viewer__node-row" });
  setIcon(summary.createSpan({ cls: "archive-viewer__node-icon" }), node.type === "directory" ? "folder" : "file");
  summary.createSpan({ cls: "archive-viewer__node-name", text: node.name });
  if (node.entry) {
    summary.createSpan({
      cls: "archive-viewer__node-meta",
      text: `${formatBytes(node.entry.size)} -> ${formatBytes(node.entry.compressedSize)}`,
    });
  }
  if (warningCount > 0) {
    summary.createSpan({ cls: "archive-viewer__node-warning", text: String(warningCount) });
  }
  if (!hasChildren) {
    details.addClass("archive-viewer__node--leaf");
  }

  sortedChildren(node).forEach((child) => renderTreeNode(details, child, depth + 1));
}

function renderEntryTable(parent: HTMLElement, entries: ArchiveEntry[]): void {
  const wrap = parent.createDiv({ cls: "archive-viewer__table-wrap" });
  const table = wrap.createEl("table", { cls: "archive-viewer__table" });
  const head = table.createEl("thead");
  const headRow = head.createEl("tr");
  ["Path", "Type", "Size", "Compressed", "Modified", "Method", "Warnings"].forEach((label) => {
    headRow.createEl("th", { text: label });
  });

  const body = table.createEl("tbody");
  entries.forEach((entry) => {
    const row = body.createEl("tr");
    row.toggleClass("has-warning", entry.warnings.length > 0);
    row.createEl("td", { cls: "archive-viewer__path-cell", text: entry.path });
    row.createEl("td", { text: entry.type });
    row.createEl("td", { text: formatBytes(entry.size) });
    row.createEl("td", { text: formatBytes(entry.compressedSize) });
    row.createEl("td", { text: entry.modifiedAt || "unknown" });
    row.createEl("td", { text: entry.compressionLabel });
    row.createEl("td", { text: entry.warnings.join(" ") || "none" });
  });
}

function sortedChildren(node: ArchiveTreeNode): ArchiveTreeNode[] {
  return Array.from(node.children.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function createIconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "clickable-icon archive-viewer__button",
    attr: { "aria-label": label, title: label, type: "button" },
  });
  setIcon(button, icon);
  return button;
}

function renderMessage(parent: HTMLElement, message: string): void {
  parent.createDiv({ cls: "archive-viewer__message", text: message });
}

function isArchiveFile(file: TFile | null): file is TFile {
  return Boolean(file && ARCHIVE_EXTENSIONS.includes(file.extension.toLowerCase()));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
