import {
	App,
	Plugin,
	TFile,
	TFolder,
	Menu,
	Notice,
	TAbstractFile,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	ItemView,
	normalizePath,
	Modal,
	MarkdownView,
} from "obsidian";

interface ZenSpaceSettings {
	createIndexFile: boolean;
	useLongformTemplate: boolean;
	includeSubfolders: boolean;
	includeCanvasFiles: boolean;
	includeOtherFormats: boolean;
	hideFileExtensions: boolean;
	defaultSortBy: "filename" | "created" | "modified";
	defaultSortOrder: "asc" | "desc";
	showSearchBar: boolean;
	showQuickActions: boolean;
	showBreadcrumbs: boolean;
	pinnedItems: string[]; // Store paths of pinned items
}

const DEFAULT_SETTINGS: ZenSpaceSettings = {
	createIndexFile: true,
	useLongformTemplate: true,
	includeSubfolders: true,
	includeCanvasFiles: true,
	includeOtherFormats: true,
	hideFileExtensions: false,
	defaultSortBy: "filename",
	defaultSortOrder: "asc",
	showSearchBar: true,
	showQuickActions: true,
	showBreadcrumbs: true,
	pinnedItems: [],
};

// Define the view type for our custom view
const ZEN_SPACE_VIEW_TYPE = "zen-space-view";

class ZenSpaceView extends ItemView {
	folder: TFolder;
	public contentEl: HTMLElement;
	private fileListContainer: HTMLElement;
	private plugin: ZenSpacePlugin;
	public currentSortBy: "filename" | "created" | "modified";
	public currentSortOrder: "asc" | "desc";
	private searchTerm = "";
	private expandedFolders: Set<string> = new Set(); // Track expanded folders

	constructor(leaf: WorkspaceLeaf, folder: TFolder, plugin: ZenSpacePlugin) {
		super(leaf);
		this.folder = folder;
		this.plugin = plugin;
		this.currentSortBy = this.plugin.settings.defaultSortBy;
		this.currentSortOrder = this.plugin.settings.defaultSortOrder;
	}

	getViewType(): string {
		return ZEN_SPACE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return `Zen Space: ${this.folder.name}`;
	}

	getIcon(): string {
		return "target";
	}

	// Called after this.containerEl is created and before this.onOpen()
	onPaneMenu(menu: Menu, source: string): void {
		super.onPaneMenu(menu, source);

		menu.addItem((item) => {
			item.setTitle("Refresh view")
				.setIcon("refresh-cw")
				.onClick(() => {
					this.refreshView();
				});
		});
	}

	// Add the custom icon to the tab header
	onload(): void {
		super.onload();

		// Set the custom icon for the workspace tab
		const tabHeaderIcon = document.querySelector(
			`.workspace-tab-header[data-type="${ZEN_SPACE_VIEW_TYPE}"] .workspace-tab-header-inner-icon`
		);
		if (tabHeaderIcon) {
			tabHeaderIcon.innerHTML =
				'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke="#4CAF50"/><circle cx="12" cy="12" r="6" stroke="#4CAF50"/><circle cx="12" cy="12" r="2" fill="#4CAF50"/></svg>';
		}
	}

	async onOpen(): Promise<void> {
		// Clear content
		this.contentEl = this.containerEl.querySelector(
			".view-content"
		) as HTMLElement;
		this.contentEl.empty();

		// Add breadcrumbs if enabled
		if (this.plugin.settings.showBreadcrumbs) {
			this.renderBreadcrumbs();
		}

		// Create navigation bar with folder name and buttons
		const navBar = this.contentEl.createEl("div", {
			cls: "zen-space-nav-bar",
		});

		// Create folder title and controls container for better layout
		const titleContainer = navBar.createEl("div", {
			cls: "zen-space-title-container",
		});
		titleContainer.createEl("h3", { text: this.folder.name });

		// Create controls container
		const controlsContainer = navBar.createEl("div", {
			cls: "zen-space-controls",
		});

		// Add sort selector
		const sortContainer = controlsContainer.createEl("div", {
			cls: "zen-space-sort-selector",
		});
		sortContainer.createEl("span", {
			text: "Sort:",
			cls: "zen-space-sort-label",
		});

		// Create sort by dropdown
		const sortSelect = sortContainer.createEl("select", {
			cls: "zen-space-sort-select",
		});

		// Add options
		const sortOptions = [
			{ value: "filename", text: "Name" },
			{ value: "created", text: "Created" },
			{ value: "modified", text: "Modified" },
		];

		sortOptions.forEach((option) => {
			const optionEl = sortSelect.createEl("option", {
				text: option.text,
				value: option.value,
			});

			if (option.value === this.currentSortBy) {
				optionEl.selected = true;
			}
		});

		// Add event listener
		sortSelect.addEventListener("change", () => {
			this.currentSortBy = sortSelect.value as
				| "filename"
				| "created"
				| "modified";
			this.refreshView();
		});

		// Add sort order button with updated SVG
		const sortOrderButton = controlsContainer.createEl("button", {
			cls: "zen-space-sort-order",
			attr: {
				"aria-label": "Toggle sort order",
			},
		});

		sortOrderButton.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-sort-asc"><path d="m3 8 4-4 4 4"></path><path d="M7 4v16"></path><path d="M11 12h4"></path><path d="M11 16h7"></path><path d="M11 20h10"></path></svg>';

		sortOrderButton.addEventListener("click", () => {
			this.currentSortOrder =
				this.currentSortOrder === "asc" ? "desc" : "asc";
			this.refreshView();
		});

		// Add "New Folder" button
		const newFolderButton = controlsContainer.createEl("button", {
			cls: "zen-space-new-folder-button",
			attr: {
				"aria-label": "New folder",
			},
		});
		newFolderButton.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-folder-plus"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path><path d="M12 10v6"></path><path d="M9 13h6"></path></svg>';

		newFolderButton.addEventListener("click", async () => {
			await this.createNewFolder();
		});

		// Add "New Canvas File" button
		const newCanvasButton = controlsContainer.createEl("button", {
			cls: "zen-space-new-canvas-button",
			attr: {
				"aria-label": "New canvas file",
			},
		});
		newCanvasButton.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-layout-dashboard"><rect width="7" height="9" x="3" y="3" rx="1"></rect><rect width="7" height="5" x="14" y="3" rx="1"></rect><rect width="7" height="9" x="14" y="12" rx="1"></rect><rect width="7" height="5" x="3" y="16" rx="1"></rect></svg>';

		newCanvasButton.addEventListener("click", async () => {
			await this.createNewCanvasFile();
		});

		// Add "New File" button
		const newFileButton = controlsContainer.createEl("button", {
			cls: "zen-space-new-file-button",
			attr: {
				"aria-label": "New file",
			},
		});
		newFileButton.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-file-pen"><path d="M12.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v9.5"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M13.378 15.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"></path></svg>';

		newFileButton.addEventListener("click", async () => {
			await this.createNewFile();
		});

		// Add search bar if enabled
		if (this.plugin.settings.showSearchBar) {
			const searchContainer = this.contentEl.createEl("div", {
				cls: "zen-space-search-container",
			});

			const searchIcon = searchContainer.createEl("div", {
				cls: "zen-space-search-icon",
			});
			searchIcon.innerHTML =
				'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

			const searchInput = searchContainer.createEl("input", {
				cls: "zen-space-search-input",
				attr: {
					placeholder: "Search files...",
					type: "text",
				},
			});

			searchInput.addEventListener("input", (e) => {
				this.searchTerm = (
					e.target as HTMLInputElement
				).value.toLowerCase();
				this.refreshView();
			});
		}

		// Create file list container
		this.fileListContainer = this.contentEl.createEl("div", {
			cls: "zen-space-file-list",
		});

		// Display files in folder
		this.displayFolderContents(this.folder, this.fileListContainer, true);

		// Set up event listeners for file changes
		this.registerFileEvents();
	}

	// Render breadcrumbs for navigation
	renderBreadcrumbs() {
		const breadcrumbs = this.contentEl.createEl("div", {
			cls: "zen-space-breadcrumbs",
		});

		// Start with root
		const root = this.app.vault.getRoot();

		// Build the breadcrumb path
		const path = [];
		let currentFolder = this.folder;

		while (currentFolder && currentFolder !== root) {
			path.unshift(currentFolder);
			if (currentFolder.parent) {
				currentFolder = currentFolder.parent;
			} else {
				break;
			}
		}

		// Add root
		const rootItem = breadcrumbs.createEl("span", {
			text: "Root",
			cls: "zen-space-breadcrumb-item",
		});
		rootItem.addEventListener("click", () => {
			this.navigateToFolder(root);
		});

		// Add separator if needed
		if (path.length > 0) {
			breadcrumbs.createEl("span", {
				text: "/",
				cls: "zen-space-breadcrumb-separator",
			});
		}

		// Add path items
		path.forEach((folder, index) => {
			const item = breadcrumbs.createEl("span", {
				text: folder.name,
				cls: "zen-space-breadcrumb-item",
			});

			item.addEventListener("click", () => {
				this.navigateToFolder(folder);
			});

			// Add separator if not the last item
			if (index < path.length - 1) {
				breadcrumbs.createEl("span", {
					text: "/",
					cls: "zen-space-breadcrumb-separator",
				});
			}
		});
	}

	// Check if an item is pinned
	isItemPinned(path: string): boolean {
		return this.plugin.settings.pinnedItems.includes(path);
	}

	// Toggle pin status of an item
	async togglePinItem(path: string) {
		const pinnedItems = this.plugin.settings.pinnedItems;
		const isPinned = pinnedItems.includes(path);

		if (isPinned) {
			// Remove from pinned items
			this.plugin.settings.pinnedItems = pinnedItems.filter(
				(item) => item !== path
			);
		} else {
			// Add to pinned items
			this.plugin.settings.pinnedItems.push(path);
		}

		// Save settings
		await this.plugin.saveSettings();

		// Refresh view to update sorting
		this.refreshView();
	}

	// Create a new folder
	async createNewFolder() {
		const folderName = await new Promise<string | null>((resolve) => {
			new FolderNameModal(this.app, "Enter folder name", resolve).open();
		});
		if (!folderName) return;

		try {
			await this.app.vault.createFolder(
				`${this.folder.path}/${folderName}`
			);
			new Notice(`Folder created: ${folderName}`);
			this.refreshView();
		} catch (error) {
			new Notice(`Error creating folder: ${error}`);
		}
	}

	// Create a new canvas file
	async createNewCanvasFile() {
		// Create a suggested name based on current date/time
		const timestamp = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.substring(0, 19);
		const suggestedName = `Canvas ${timestamp}.canvas`;

		try {
			const newFilePath = normalizePath(
				`${this.folder.path}/${suggestedName}`
			);
			// Create canvas file with empty canvas data structure
			const canvasData = {
				nodes: [],
				edges: [],
			};

			const newFile = await this.app.vault.create(
				newFilePath,
				JSON.stringify(canvasData, null, 2)
			);

			// Open the new canvas file
			this.app.workspace.getLeaf().openFile(newFile);
			new Notice(`Canvas file created: ${suggestedName}`);
		} catch (error) {
			new Notice(`Error creating canvas file: ${error}`);
		}
	}

	// Navigate to a different folder
	navigateToFolder(folder: TFolder) {
		this.folder = folder;
		this.refreshView(true);
	}

	// Register events to refresh view when files change
	registerFileEvents() {
		// When files are created or deleted
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (this.isInCurrentFolder(file)) {
					this.refreshView();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (this.isInCurrentFolder(file)) {
					this.refreshView();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				// Check if either the old or new path is in our folder
				if (
					this.isInCurrentFolder(file) ||
					this.isPathInCurrentFolder(oldPath)
				) {
					this.refreshView();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (
					this.isInCurrentFolder(file) &&
					this.currentSortBy === "modified"
				) {
					this.refreshView();
				}
			})
		);
	}

	// Helper to check if a file is in the current folder
	isInCurrentFolder(file: TAbstractFile): boolean {
		if (!this.plugin.settings.includeSubfolders) {
			return file.parent === this.folder;
		}

		return (
			file.parent === this.folder ||
			(file.path.startsWith(this.folder.path) &&
				file.path.substring(this.folder.path.length).startsWith("/"))
		);
	}

	// Helper to check if a path is in the current folder
	isPathInCurrentFolder(path: string): boolean {
		if (!this.plugin.settings.includeSubfolders) {
			return (
				path.startsWith(this.folder.path + "/") &&
				!path.substring(this.folder.path.length + 1).includes("/")
			);
		}

		return path.startsWith(this.folder.path + "/");
	}

	// Create a new file in the current folder
	async createNewFile() {
		// Create a suggested name based on current date/time
		const timestamp = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.substring(0, 19);
		const suggestedName = `Untitled ${timestamp}.md`;

		// Create the file
		try {
			const newFilePath = normalizePath(
				`${this.folder.path}/${suggestedName}`
			);
			const newFile = await this.app.vault.create(newFilePath, "");

			// Update the Index file after creating a new file
			if (this.plugin.settings.createIndexFile) {
				await this.plugin.updateIndexFileContent(this.folder);
			}

			// Open the new file
			const leaf = this.app.workspace.getLeaf();
			await leaf.openFile(newFile);

			// Put the editor in edit mode and focus it - using the correct API
			const activeView =
				this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView?.editor) {
				activeView.editor.focus();
			}
		} catch (error) {
			new Notice(`Error creating new file: ${error}`);
		}
	}

	// Create a new file in a specified folder
	async createNewFileInFolder(folder: TFolder) {
		// Create a suggested name based on current date/time
		const timestamp = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.substring(0, 19);
		const suggestedName = `Untitled ${timestamp}.md`;

		// Create the file
		try {
			const newFilePath = normalizePath(
				`${folder.path}/${suggestedName}`
			);
			const newFile = await this.app.vault.create(newFilePath, "");

			// Update the Index file after creating a new file
			if (this.plugin.settings.createIndexFile) {
				await this.plugin.updateIndexFileContent(folder);
			}

			// Open the new file
			const leaf = this.app.workspace.getLeaf();
			await leaf.openFile(newFile);

			// Put the editor in edit mode and focus it - using the correct API
			const activeLeaf = this.app.workspace.getActiveViewOfType;
			if (
				activeLeaf &&
				activeLeaf &&
				(activeLeaf as unknown as MarkdownView).editor
			) {
				if (activeLeaf instanceof MarkdownView) {
					activeLeaf.editor.focus();
				}
			}
		} catch (error) {
			new Notice(`Error creating new file: ${error}`);
		}
	}

	// Create a new canvas file in a specified folder
	async createNewCanvasFileInFolder(folder: TFolder) {
		// Create a suggested name based on current date/time
		const timestamp = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.substring(0, 19);
		const suggestedName = `Canvas ${timestamp}.canvas`;

		try {
			const newFilePath = normalizePath(
				`${folder.path}/${suggestedName}`
			);
			// Create canvas file with empty canvas data structure
			const canvasData = {
				nodes: [],
				edges: [],
			};

			const newFile = await this.app.vault.create(
				newFilePath,
				JSON.stringify(canvasData, null, 2)
			);

			// Open the new canvas file
			this.app.workspace.getLeaf().openFile(newFile);
			new Notice(`Canvas file created: ${suggestedName}`);
		} catch (error) {
			new Notice(`Error creating canvas file: ${error}`);
		}
	}

	// Create a new subfolder in a specified folder
	async createNewSubfolder(parentFolder: TFolder) {
		const folderName = await new Promise<string | null>((resolve) => {
			new FolderNameModal(this.app, "Enter folder name", resolve).open();
		});
		if (!folderName) return;

		try {
			await this.app.vault.createFolder(
				`${parentFolder.path}/${folderName}`
			);
			new Notice(`Folder created: ${folderName}`);
			this.refreshView();
		} catch (error) {
			new Notice(`Error creating folder: ${error}`);
		}
	}

	// Refresh the view with current folder contents
	refreshView(fullRefresh = false) {
		if (fullRefresh) {
			// Full refresh includes updating the breadcrumbs
			this.onOpen();
			return;
		}

		if (this.fileListContainer) {
			this.fileListContainer.empty();
			this.displayFolderContents(
				this.folder,
				this.fileListContainer,
				true
			);
		}
	}

	// Helper to get a file's creation or modification time
	getFileTime(file: TFile, type: "created" | "modified"): number {
		if (type === "created") {
			return file.stat.ctime;
		} else {
			return file.stat.mtime;
		}
	}

	// Helper to format the display name of a file
	formatDisplayName(file: TAbstractFile): string {
		if (file instanceof TFolder) {
			return file.name;
		}

		if (this.plugin.settings.hideFileExtensions && file instanceof TFile) {
			// Remove the extension from display name
			return file.name.slice(0, -(file.extension.length + 1));
		}

		return file.name;
	}

	// Helper to check if a file should be included based on settings
	shouldIncludeFile(file: TAbstractFile): boolean {
		if (file instanceof TFolder) {
			return this.plugin.settings.includeSubfolders;
		}

		// File must be a TFile to check extension
		if (file instanceof TFile) {
			// Canvas files
			if (file.extension === "canvas") {
				return this.plugin.settings.includeCanvasFiles;
			}

			// Markdown files always included
			if (file.extension === "md") {
				return true;
			}

			// Other formats
			return this.plugin.settings.includeOtherFormats;
		}

		return false;
	}

	// Helper to check if a file matches the search term
	matchesSearch(file: TAbstractFile): boolean {
		if (!this.searchTerm) return true;

		return file.name.toLowerCase().includes(this.searchTerm);
	}

	// Display folder context menu
	showFolderContextMenu(folder: TFolder, event: MouseEvent) {
		const menu = new Menu();

		// Open in Zen Space
		menu.addItem((item) => {
			item.setTitle("Open in Zen Space")
				.setIcon("target")
				.onClick(async () => {
					this.navigateToFolder(folder);
				});
		});

		// Pin/Unpin folder
		const isPinned = this.isItemPinned(folder.path);
		menu.addItem((item) => {
			item.setTitle(isPinned ? "Unpin folder" : "Pin folder")
				.setIcon(isPinned ? "pin-off" : "pin")
				.onClick(async () => {
					await this.togglePinItem(folder.path);
				});
		});

		// New file in folder
		menu.addItem((item) => {
			item.setTitle("New file")
				.setIcon("file-plus")
				.onClick(async () => {
					await this.createNewFileInFolder(folder);
				});
		});

		// New canvas file in folder
		menu.addItem((item) => {
			item.setTitle("New canvas")
				.setIcon("layout-dashboard")
				.onClick(async () => {
					await this.createNewCanvasFileInFolder(folder);
				});
		});

		// New subfolder
		menu.addItem((item) => {
			item.setTitle("New subfolder")
				.setIcon("folder-plus")
				.onClick(async () => {
					await this.createNewSubfolder(folder);
				});
		});

		// Separator
		menu.addSeparator();

		// Rename folder
		menu.addItem((item) => {
			item.setTitle("Rename")
				.setIcon("pencil")
				.onClick(async () => {
					await this.renameFolder(folder);
				});
		});

		// Delete folder
		menu.addItem((item) => {
			item.setTitle("Delete")
				.setIcon("trash")
				.onClick(async () => {
					await this.deleteFolder(folder);
				});
		});

		// Show the menu at the click position
		menu.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	// Display file context menu
	showFileContextMenu(file: TFile, event: MouseEvent) {
		const menu = new Menu();

		// Open file
		menu.addItem((item) => {
			item.setTitle("Open")
				.setIcon("file")
				.onClick(() => {
					this.app.workspace.getLeaf().openFile(file);
				});
		});

		// Open in new tab
		menu.addItem((item) => {
			item.setTitle("Open in new tab")
				.setIcon("file-plus")
				.onClick(() => {
					this.app.workspace.getLeaf("tab").openFile(file);
				});
		});

		// Open in new pane
		menu.addItem((item) => {
			item.setTitle("Open in new pane")
				.setIcon("split")
				.onClick(() => {
					this.app.workspace.getLeaf("split").openFile(file);
				});
		});

		// Pin/Unpin file
		const isPinned = this.isItemPinned(file.path);
		menu.addItem((item) => {
			item.setTitle(isPinned ? "Unpin file" : "Pin file")
				.setIcon(isPinned ? "pin-off" : "pin")
				.onClick(async () => {
					await this.togglePinItem(file.path);
				});
		});

		// Separator
		menu.addSeparator();

		// Rename file
		menu.addItem((item) => {
			item.setTitle("Rename")
				.setIcon("pencil")
				.onClick(async () => {
					await this.renameFile(file);
				});
		});

		// Delete file
		menu.addItem((item) => {
			item.setTitle("Delete")
				.setIcon("trash")
				.onClick(async () => {
					await this.deleteFile(file);
				});
		});

		// Show the menu at the click position
		menu.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	displayFolderContents(
		folder: TFolder,
		container: HTMLElement,
		isRootFolder = false
	) {
		// Get all files that should be included based on settings
		let filesToDisplay = folder.children.filter((file) => {
			// For root folder, always include subfolders in the list if settings allow
			if (isRootFolder && file instanceof TFolder) {
				return this.plugin.settings.includeSubfolders;
			}

			// For subfolders, only process the files; subfolder contents will be
			// handled when the subfolder is expanded
			if (!isRootFolder && file instanceof TFolder) {
				return false;
			}

			return this.shouldIncludeFile(file) && this.matchesSearch(file);
		});

		// Skip processing if no files to display and not the root folder
		if (filesToDisplay.length === 0 && !isRootFolder) {
			return;
		}

		// Sort files based on current sort settings
		filesToDisplay = this.sortFiles(filesToDisplay);

		if (filesToDisplay.length === 0) {
			container.createEl("div", {
				cls: "zen-space-empty-message",
				text: this.searchTerm
					? "No matching files found"
					: "No files in this folder",
			});
			return;
		}

		// Create list element for each file
		for (const file of filesToDisplay) {
			const fileItem = container.createEl("div", {
				cls: "zen-space-file-item",
			});

			// Add pinned indicator class if the file is pinned
			if (this.isItemPinned(file.path)) {
				fileItem.addClass("zen-space-pinned-item");
			}

			// Different styling for files vs folders
			if (file instanceof TFolder) {
				fileItem.addClass("zen-space-folder-item");

				// Add collapse/expand icon
				const toggleIcon = fileItem.createEl("span", {
					cls: "zen-space-folder-toggle",
				});
				const isExpanded = this.expandedFolders.has(file.path);

				toggleIcon.innerHTML = isExpanded
					? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>'
					: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

				toggleIcon.addEventListener("click", (e) => {
					e.stopPropagation();
					if (isExpanded) {
						this.expandedFolders.delete(file.path);
					} else {
						this.expandedFolders.add(file.path);
					}
					this.refreshView();
				});

				// Add folder icon if we're not hiding icons
				if (!this.plugin.settings.hideFileExtensions) {
					const folderIcon = fileItem.createEl("span", {
						cls: "zen-space-item-icon",
					});
					folderIcon.innerHTML =
						'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>';
				}

				const nameContainer = fileItem.createEl("div", {
					cls: "zen-space-name-container",
				});
				nameContainer.createEl("span", {
					text: this.formatDisplayName(file),
					cls: "zen-space-item-name zen-space-file-name",
				});

				// Make folder clickable to toggle expansion
				const childContainer = container.createEl("div", {
					cls: "zen-space-subfolder-container",
				});

				// Set display based on expanded state
				childContainer.style.display = this.expandedFolders.has(
					file.path
				)
					? "block"
					: "none";

				// Only populate child container if expanded
				if (this.expandedFolders.has(file.path)) {
					this.displayFolderContents(file as TFolder, childContainer);
				}

				fileItem.addEventListener("click", () => {
					const isExpanded = this.expandedFolders.has(file.path);
					if (isExpanded) {
						this.expandedFolders.delete(file.path);
					} else {
						this.expandedFolders.add(file.path);
					}
					this.refreshView();
				});

				// Add context menu on right click
				fileItem.addEventListener("contextmenu", (e) => {
					e.preventDefault();
					this.showFolderContextMenu(file as TFolder, e);
				});

				// Add quick actions if enabled
				if (this.plugin.settings.showQuickActions) {
					this.addFolderActions(fileItem, file as TFolder);
				}
			} else if (file instanceof TFile) {
				// Add file icon if we're not hiding icons
				if (!this.plugin.settings.hideFileExtensions) {
					const fileIcon = fileItem.createEl("span", {
						cls: "zen-space-item-icon",
					});

					// Different icon based on file type
					if (file.extension === "md") {
						fileIcon.innerHTML =
							'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
					} else if (file.extension === "canvas") {
						fileIcon.innerHTML =
							'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><path d="M21 9h-18"></path><path d="M21 15h-18"></path><path d="M9 3v18"></path><path d="M15 3v18"></path></svg>';
					} else {
						fileIcon.innerHTML =
							'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
					}
				}

				const nameContainer = fileItem.createEl("div", {
					cls: "zen-space-name-container",
				});

				// Display name without extension if setting is enabled
				nameContainer.createEl("span", {
					text: this.formatDisplayName(file),
					cls: "zen-space-item-name zen-space-file-name",
				});

				// Add extension badge for non-markdown files if not hiding extensions
				if (
					!this.plugin.settings.hideFileExtensions &&
					file.extension !== "md"
				) {
					nameContainer.createEl("span", {
						text: file.extension.toUpperCase(),
						cls: "zen-space-extension-badge",
					});
				}

				// Make file clickable to open
				fileItem.addEventListener("click", (e) => {
					// Only open if the click wasn't on an action button
					if (
						!(e.target as HTMLElement).closest(
							".zen-space-file-action-button"
						)
					) {
						this.app.workspace.getLeaf().openFile(file);
					}
				});

				// Add context menu on right click
				fileItem.addEventListener("contextmenu", (e) => {
					e.preventDefault();
					this.showFileContextMenu(file, e);
				});

				// Add quick actions if enabled
				if (this.plugin.settings.showQuickActions) {
					this.addFileActions(fileItem, file);
				}
			}
		}
	}

	// Add quick action buttons for files
	addFileActions(fileItem: HTMLElement, file: TFile) {
		const actionsContainer = fileItem.createEl("div", {
			cls: "zen-space-file-actions",
		});

		// Open in new pane button
		const openInPaneButton = actionsContainer.createEl("button", {
			cls: "zen-space-file-action-button",
			attr: {
				"aria-label": "Open in new pane",
			},
		});
		openInPaneButton.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path></svg>';

		openInPaneButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.app.workspace.getLeaf("split").openFile(file);
		});

		// Pin/Unpin button
		const isPinned = this.isItemPinned(file.path);
		const pinButton = actionsContainer.createEl("button", {
			cls:
				"zen-space-file-action-button" + (isPinned ? " is-pinned" : ""),
			attr: {
				"aria-label": isPinned ? "Unpin file" : "Pin file",
			},
		});
		pinButton.innerHTML = isPinned
			? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>'
			: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>';

		pinButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.togglePinItem(file.path);
		});

		// Rename button
		const renameButton = actionsContainer.createEl("button", {
			cls: "zen-space-file-action-button",
			attr: {
				"aria-label": "Rename file",
			},
		});
		renameButton.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>';

		renameButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.renameFile(file);
		});

		// Delete button
		const deleteButton = actionsContainer.createEl("button", {
			cls: "zen-space-file-action-button",
			attr: {
				"aria-label": "Delete file",
			},
		});
		deleteButton.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>';

		deleteButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.deleteFile(file);
		});
	}

	// Add quick action buttons for folders
	addFolderActions(fileItem: HTMLElement, folder: TFolder) {
		const actionsContainer = fileItem.createEl("div", {
			cls: "zen-space-file-actions",
		});

		// Pin/Unpin button
		const isPinned = this.isItemPinned(folder.path);
		const pinButton = actionsContainer.createEl("button", {
			cls:
				"zen-space-file-action-button" + (isPinned ? " is-pinned" : ""),
			attr: {
				"aria-label": isPinned ? "Unpin folder" : "Pin folder",
			},
		});
		pinButton.innerHTML = isPinned
			? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>'
			: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>';

		pinButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.togglePinItem(folder.path);
		});

		// New file in folder button
		const newFileButton = actionsContainer.createEl("button", {
			cls: "zen-space-file-action-button",
			attr: {
				"aria-label": "New file in folder",
			},
		});
		newFileButton.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>';

		newFileButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.createNewFileInFolder(folder);
		});

		// Open in Zen Space button
		const openButton = actionsContainer.createEl("button", {
			cls: "zen-space-file-action-button",
			attr: {
				"aria-label": "Open in Zen Space",
			},
		});
		openButton.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>';

		openButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.navigateToFolder(folder);
		});
	}

	// Rename a folder
	async renameFolder(folder: TFolder) {
		const currentName = folder.name;

		// Get new name from user
		const newName = await new Promise<string | null>((resolve) => {
			new FolderNameModal(
				this.app,
				"Enter new folder name",
				resolve
			).open();
		});

		if (newName && newName !== currentName) {
			try {
				// The promptForFileRename method handles the actual rename operation
				new Notice(`Folder renamed to ${newName}`);

				// Update any pinned items with the new path
				const oldPath = folder.path;
				const newPath = folder.parent
					? `${folder.parent.path}/${newName}`
					: newName;

				// Update pinned items that contain this path
				this.plugin.settings.pinnedItems =
					this.plugin.settings.pinnedItems.map((item) => {
						if (item === oldPath) {
							return newPath;
						}
						if (item.startsWith(oldPath + "/")) {
							return newPath + item.substring(oldPath.length);
						}
						return item;
					});

				await this.plugin.saveSettings();
				this.refreshView();
			} catch (error) {
				new Notice(`Error renaming folder: ${error}`);
			}
		}
	}

	// Delete a folder
	async deleteFolder(folder: TFolder) {
		// Confirm deletion
		const confirmed = confirm(
			`Are you sure you want to delete "${folder.name}" and all its contents?`
		);

		if (confirmed) {
			try {
				// Remove folder and its contents from pinned items
				this.plugin.settings.pinnedItems =
					this.plugin.settings.pinnedItems.filter(
						(item) =>
							!item.startsWith(folder.path + "/") &&
							item !== folder.path
					);

				await this.app.vault.delete(folder, true);
				await this.plugin.saveSettings();
				new Notice(`Folder deleted: ${folder.name}`);
				this.refreshView();
			} catch (error) {
				new Notice(`Error deleting folder: ${error}`);
			}
		}
	}

	// Rename a file
	async renameFile(file: TFile) {
		const currentName = file.name;
		const oldFolder = file.parent;
		const oldPath = file.path;

		// Get new name from user
		const newName = await new Promise<string | null>((resolve) => {
			new FolderNameModal(
				this.app,
				"Enter new file name",
				resolve
			).open();
		});

		if (newName && newName !== currentName) {
			try {
				// The promptForFileRename method handles the actual rename operation
				new Notice(`File renamed to ${newName}`);

				// Update pinned items
				const newPath = file.parent
					? `${file.parent.path}/${newName}`
					: newName;
				this.plugin.settings.pinnedItems =
					this.plugin.settings.pinnedItems.map((item) =>
						item === oldPath ? newPath : item
					);

				await this.plugin.saveSettings();

				// Update the Index file
				if (this.plugin.settings.createIndexFile) {
					// Update old folder's index if the file was moved
					if (file.parent !== oldFolder && oldFolder) {
						await this.plugin.updateIndexFileContent(oldFolder);
					}

					// Update current folder's index
					if (file.parent) {
						await this.plugin.updateIndexFileContent(file.parent);
					}
				}
			} catch (error) {
				new Notice(`Error renaming file: ${error}`);
			}
		}
	}

	// Delete a file
	async deleteFile(file: TFile) {
		// Confirm deletion
		const confirmed = confirm(
			`Are you sure you want to delete "${file.name}"?`
		);

		if (confirmed) {
			const folder = file.parent;

			try {
				// Remove from pinned items if needed
				if (this.isItemPinned(file.path)) {
					this.plugin.settings.pinnedItems =
						this.plugin.settings.pinnedItems.filter(
							(item) => item !== file.path
						);
					await this.plugin.saveSettings();
				}

				await this.app.vault.delete(file);
				new Notice(`File deleted: ${file.name}`);

				// Update the Index file
				if (this.plugin.settings.createIndexFile && folder) {
					await this.plugin.updateIndexFileContent(folder);
				}
			} catch (error) {
				new Notice(`Error deleting file: ${error}`);
			}
		}
	}

	// Helper to sort files based on current settings
	sortFiles(files: TAbstractFile[]): TAbstractFile[] {
		return files.sort((a, b) => {
			// First separate pinned items
			const aPinned = this.isItemPinned(a.path);
			const bPinned = this.isItemPinned(b.path);

			// Pinned items always come first
			if (aPinned && !bPinned) return -1;
			if (!aPinned && bPinned) return 1;

			// If both are pinned or both are not pinned, continue with normal sorting

			// Always put folders before files (unless pinned status is different)
			if (a instanceof TFolder && !(b instanceof TFolder)) return -1;
			if (!(a instanceof TFolder) && b instanceof TFolder) return 1;

			// For two files or two folders, sort by the selected criteria
			let comparison = 0;

			if (this.currentSortBy === "filename") {
				comparison = a.name.localeCompare(b.name);
			} else if (a instanceof TFile && b instanceof TFile) {
				// Only TFiles have created/modified times
				comparison =
					this.getFileTime(a, this.currentSortBy) -
					this.getFileTime(b, this.currentSortBy);
			}

			// Adjust for sort order
			return this.currentSortOrder === "asc" ? comparison : -comparison;
		});
	}
}

// Modal for folder name input
class FolderNameModal extends Modal {
	result: string | null = null;
	onSubmit: (result: string | null) => void;
	promptText: string;

	constructor(
		app: App,
		promptText: string,
		onSubmit: (result: string | null) => void
	) {
		super(app);
		this.promptText = promptText;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: this.promptText });

		const inputContainer = contentEl.createEl("div", {
			cls: "zen-space-modal-input-container",
		});
		const folderNameInput = inputContainer.createEl("input", {
			type: "text",
			cls: "zen-space-modal-input",
		});
		folderNameInput.focus();

		const buttonContainer = contentEl.createEl("div", {
			cls: "zen-space-modal-button-container",
		});

		const submitButton = buttonContainer.createEl("button", {
			text: "Create",
			cls: "mod-cta",
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
		});

		// Submit on enter key
		folderNameInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				this.result = folderNameInput.value;
				this.close();
			}
		});

		submitButton.addEventListener("click", () => {
			this.result = folderNameInput.value;
			this.close();
		});

		cancelButton.addEventListener("click", () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.onSubmit(this.result);
	}
}

export default class ZenSpacePlugin extends Plugin {
	settings: ZenSpaceSettings;
	activeView: ZenSpaceView | null = null;
	ribbonIcon: HTMLElement | null = null;

	async onload() {
		console.log("Loading ZenSpace plugin");

		// Load settings
		await this.loadSettings();

		// Register the custom view
		this.registerView(ZEN_SPACE_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
			const view = new ZenSpaceView(leaf, this.app.vault.getRoot(), this);
			this.activeView = view;
			return view;
		});

		// Add settings tab
		this.addSettingTab(new ZenSpaceSettingTab(this.app, this));

		// Add ribbon icon
		this.ribbonIcon = this.addRibbonIcon(
			"target",
			"Open Zen Space",
			async (evt) => {
				await this.openInZenSpace(this.app.vault.getRoot());
			}
		);

		// Register commands for hotkeys
		this.addCommands();

		// Register context menu event on folders
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFolder) {
					menu.addItem((item) => {
						item.setTitle("Open in Zen Space")
							.setIcon("target")
							.onClick(async () => {
								await this.openInZenSpace(file);
							});
					});
				}
			})
		);

		// Register events to update Index files when files change
		this.registerIndexFileUpdateEvents();

		// Register an interval that continuously adds buttons
		this.registerInterval(
			window.setInterval(() => {
				this.addZenSpaceButtons();
			}, 1000)
		);

		// Register events for file explorer updates
		const fileExplorer = document.querySelector(".nav-files-container");
		if (fileExplorer) {
			const observer = new MutationObserver(() => {
				setTimeout(() => this.addZenSpaceButtons(), 100);
			});
			observer.observe(fileExplorer, { childList: true, subtree: true });
			this.register(() => observer.disconnect());
		}

		// Additional events for folder changes
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				setTimeout(() => this.addZenSpaceButtons(), 100);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file) => {
				setTimeout(() => this.addZenSpaceButtons(), 100);
			})
		);

		// Create a mutation observer to watch for DOM changes
		this.setupMutationObserver();

		// Initial calls to add buttons
		for (const delay of [100, 300, 500, 1000, 2000]) {
			setTimeout(() => {
				this.addZenSpaceButtons();
			}, delay);
		}

		// Add immediately as well
		this.addZenSpaceButtons();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	setupMutationObserver() {
		const observer = new MutationObserver((mutations) => {
			const shouldUpdate = mutations.some((mutation) => {
				if (
					mutation.type === "childList" &&
					mutation.addedNodes.length > 0
				) {
					return true;
				}
				return false;
			});

			if (shouldUpdate) {
				this.addZenSpaceButtons();
			}
		});

		// Start observing the file explorer
		this.registerInterval(
			window.setInterval(() => {
				const fileExplorer = document.querySelector(
					".nav-files-container"
				);
				const observedElements = new WeakMap<Element, boolean>();
				if (fileExplorer && !observedElements.has(fileExplorer)) {
					observedElements.set(fileExplorer, true);
					observer.observe(fileExplorer, {
						childList: true,
						subtree: true,
					});
					observedElements.set(fileExplorer, true);
				}
			}, 2000)
		);
	}

	async openInZenSpace(folder: TFolder) {
		// First, create or update the index file if enabled in settings
		if (this.settings.createIndexFile) {
			await this.createIndexFile(folder);
		}

		// Check if we already have a Zen Space view open
		let leaf = this.app.workspace.getLeavesOfType(ZEN_SPACE_VIEW_TYPE)[0];

		// If not, create a new leaf in the LEFT sidebar
		if (!leaf) {
			const leftLeaf = this.app.workspace.getLeftLeaf(false);
			if (!leftLeaf) {
				throw new Error("Failed to get a left workspace leaf.");
			}
			leaf = leftLeaf;
		}

		// Create a new custom view for this specific folder
		await leaf.setViewState({
			type: ZEN_SPACE_VIEW_TYPE,
			state: { folder: folder.path },
		});

		// Set the view instance's folder and refresh it
		const view = leaf.view as ZenSpaceView;
		if (view) {
			view.folder = folder;
			this.activeView = view;
			await view.onOpen(); // Refresh the view with the new folder
		}

		// Focus the leaf
		this.app.workspace.revealLeaf(leaf);

		// Update UI to show this is a Zen Space folder
		this.markFolderAsZenSpace(folder);
	}

	// Helper to mark a folder as being viewed in Zen Space
	markFolderAsZenSpace(folder: TFolder) {
		const folderElements = document.querySelectorAll(
			`.nav-folder-title[data-path="${folder.path}"]`
		);
		folderElements.forEach((folderEl) => {
			const parentFolder = folderEl.closest(".nav-folder");
			if (parentFolder) {
				parentFolder.classList.add("zen-space-active");
			}

			const button = folderEl.querySelector(".zen-space-button");
			if (button) {
				button.classList.add("active-zen-space");
				(button as HTMLElement).style.color = "var(--interactive-accent)";
			}
		});
	}

	// Create or update an Index file with a list of all files in the folder
	async createIndexFile(folder: TFolder) {
		const folderName = folder.name;
		const indexPath = `${folder.path}/Index.md`;

		// Check if Index file already exists
		const existingFile = this.app.vault.getAbstractFileByPath(indexPath);
		if (existingFile instanceof TFile) {
			// File exists, just update it
			await this.updateIndexFileContent(folder);
			return;
		}

		// Format date as YYYY-MM-DD
		const today = new Date();
		const formattedDate = today.toISOString().split("T")[0];

		// Get list of markdown files in the folder
		const files = folder.children
			.filter(
				(file) =>
					file instanceof TFile &&
					file.extension === "md" &&
					file.name !== "Index.md"
			)
			.map((file) => file.name.replace(/\.md$/, ""))
			.sort();

		// Remove duplicates
		const uniqueFiles = [...new Set(files)];

		let content = "";

		if (this.settings.useLongformTemplate) {
			// Format the files list as YAML for the scenes section
			const scenesYAML = uniqueFiles
				.map((filename) => `    - ${filename}`)
				.join("\n");

			// Create content for Index file with longform YAML and files list
			content = `---
longform:
  format: scenes
  title: ${folderName}
  workflow: Default Workflow
  sceneFolder: /
  scenes:
${scenesYAML || "    "}
   
  ignoredFiles:
    - Index
created: ${formattedDate}
updated: ${formattedDate}
---

# ${folderName}

Files in this folder:

${uniqueFiles.map((file) => `- [[${file}]]`).join("\n")}
`;
		} else {
			// Simple Index file without longform properties
			content = `---
title: ${folderName}
created: ${formattedDate}
updated: ${formattedDate}
---

# ${folderName}

Files in this folder:

${uniqueFiles.map((file) => `- [[${file}]]`).join("\n")}
`;
		}

		// Create Index file
		try {
			await this.app.vault.create(indexPath, content);
			new Notice(`Created Index file in ${folderName}`);
		} catch (error) {
			new Notice(`Error creating Index file: ${error}`);
		}
	}

	// Add a method to update the Index file content when files change
	async updateIndexFileContent(folder: TFolder) {
		const indexPath = `${folder.path}/Index.md`;
		const indexFile = this.app.vault.getAbstractFileByPath(indexPath);

		if (!indexFile || !(indexFile instanceof TFile)) {
			return;
		}

		try {
			// Read the current content of the Index file
			let content = await this.app.vault.read(indexFile);

			// Get updated list of markdown files in the folder
			const files = folder.children
				.filter(
					(file) =>
						file instanceof TFile &&
						file.extension === "md" &&
						file.name !== "Index.md"
				)
				.map((file) => file.name.replace(/\.md$/, ""))
				.sort();

			// Remove duplicates
			const uniqueFiles = [...new Set(files)];

			// Format today's date for 'updated' field
			const today = new Date();
			const formattedDate = today.toISOString().split("T")[0];

			// Check if there's frontmatter
			if (content.startsWith("---")) {
				// Split the content at the second '---'
				const parts = content.split("---", 3);
				if (parts.length >= 3) {
					let frontmatter = parts[1];
					let bodyContent = parts[2];

					// Update the updated date
					frontmatter = frontmatter.replace(
						/updated:.*\n/,
						`updated: ${formattedDate}\n`
					);

					// Check if this is a longform template
					if (
						frontmatter.includes("longform:") &&
						this.settings.useLongformTemplate
					) {
						// Update the scenes section
						const scenesYAML = uniqueFiles
							.map((filename) => `    - ${filename}`)
							.join("\n");
						frontmatter = frontmatter.replace(
							/ {2}scenes:\s*\n((?: {4}-.*\n)*)/,
							`  scenes:\n${scenesYAML || "    "}\n`
						);
					}

					// Improved regex to capture the entire file list section including all list items
					// This looks for "Files in this folder:" followed by any content until the next section
					const fileListRegex =
						/Files in this folder:[\s\S]*?(?=\n\n#|\n\n---|\n*$)/;
					const fileListMatch = bodyContent.match(fileListRegex);

					// Create the new file list section
					const fileListSection = `Files in this folder:\n\n${uniqueFiles
						.map((file) => `- [[${file}]]`)
						.join("\n")}`;

					// Replace or add the file list
					if (fileListMatch) {
						bodyContent = bodyContent.replace(
							fileListRegex,
							fileListSection
						);
					} else {
						// If there's no existing file list, add it after the first header
						const headerMatch = bodyContent.match(/^#[^#].*\n/m);
						if (headerMatch) {
							const index =
								bodyContent.indexOf(headerMatch[0]) +
								headerMatch[0].length;
							bodyContent =
								bodyContent.substring(0, index) +
								"\n\n" +
								fileListSection +
								bodyContent.substring(index);
						} else {
							// No header found, just append
							bodyContent += "\n\n" + fileListSection;
						}
					}

					// Reconstruct content with updated frontmatter and body
					content = `---${frontmatter}---${bodyContent}`;
				}
			} else {
				// No frontmatter, create a basic index file
				content = `---
title: ${folder.name}
updated: ${formattedDate}
---

# ${folder.name}

Files in this folder:

${uniqueFiles.map((file) => `- [[${file}]]`).join("\n")}
`;
			}

			// Write updated content back to the file
			await this.app.vault.modify(indexFile, content);
		} catch (error) {
			console.error("Error updating Index file:", error);
		}
	}

	// Add this method to register event handlers to update the Index file when files change
	registerIndexFileUpdateEvents() {
		// When files are created
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (
					file.parent &&
					file instanceof TFile &&
					file.extension === "md" &&
					file.name !== "Index.md"
				) {
					this.updateIndexFileContent(file.parent as TFolder);
				}
			})
		);

		// When files are deleted
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (
					file.parent &&
					file instanceof TFile &&
					file.extension === "md" &&
					file.name !== "Index.md"
				) {
					this.updateIndexFileContent(file.parent as TFolder);
				}
			})
		);

		// When files are renamed
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (
					file.parent &&
					file instanceof TFile &&
					file.extension === "md" &&
					file.name !== "Index.md"
				) {
					this.updateIndexFileContent(file.parent as TFolder);
				}

				// Also update the old folder if it was a move operation
				const oldParentPath = oldPath.substring(
					0,
					oldPath.lastIndexOf("/")
				);
				const oldParent =
					this.app.vault.getAbstractFileByPath(oldParentPath);
				if (
					oldParent &&
					oldParent instanceof TFolder &&
					oldParent !== file.parent
				) {
					this.updateIndexFileContent(oldParent);
				}
			})
		);
	}

	addZenSpaceButtons() {
		// Find all folders in the file explorer
		const folderTitles = document.querySelectorAll(".nav-folder-title");

		folderTitles.forEach((folderTitleEl) => {
			// Skip if already processed
			if (folderTitleEl.querySelector(".zen-space-button")) {
				return;
			}

			// Get folder path from the data attribute
			const folderPath = folderTitleEl.getAttribute("data-path");
			if (!folderPath) {
				return;
			}

			// Get folder from path
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!(folder instanceof TFolder)) {
				return;
			}

			// Create button element with inline SVG to ensure it renders properly
			const buttonEl = document.createElement("div");
			buttonEl.className = "zen-space-button";
			buttonEl.setAttribute("aria-label", "Open in Zen Space");
			buttonEl.innerHTML =
				'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill=""/></svg>';

			// Add click handler
			buttonEl.addEventListener("click", async (event) => {
				event.stopPropagation();
				await this.openInZenSpace(folder);
			});

			// Add to folder title
			folderTitleEl.appendChild(buttonEl);

			// Check if folder contains an Index file and mark it
			const folderEl = folderTitleEl.closest(".nav-folder");
			if (folderEl) {
				const hasIndexFile = folder.children.some(
					(file) => file instanceof TFile && file.name === "Index.md"
				);

				if (hasIndexFile && this.settings.createIndexFile) {
					folderEl.classList.add("has-index-file");
				}
			}
		});
	}

	// Add commands for hotkeys
	addCommands() {
		// Open current folder in Zen Space
		this.addCommand({
			id: "open-current-folder-in-zen-space",
			name: "Open current folder in Zen Space",
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.parent) {
					if (!checking) {
						this.openInZenSpace(activeFile.parent);
					}
					return true;
				}
				return false;
			},
		});

		// Create new file in current Zen Space view
		this.addCommand({
			id: "create-new-file-in-zen-space",
			name: "Create new file in current Zen Space view",
			checkCallback: (checking: boolean) => {
				if (this.activeView) {
					if (!checking) {
						this.activeView.createNewFile();
					}
					return true;
				}
				return false;
			},
		});

		// Create new folder in current Zen Space view
		this.addCommand({
			id: "create-new-folder-in-zen-space",
			name: "Create new folder in current Zen Space view",
			checkCallback: (checking: boolean) => {
				if (this.activeView) {
					if (!checking) {
						this.activeView.createNewFolder();
					}
					return true;
				}
				return false;
			},
		});

		// Create new canvas file in current Zen Space view
		this.addCommand({
			id: "create-new-canvas-in-zen-space",
			name: "Create new canvas in current Zen Space view",
			checkCallback: (checking: boolean) => {
				if (this.activeView) {
					if (!checking) {
						this.activeView.createNewCanvasFile();
					}
					return true;
				}
				return false;
			},
		});

		// Toggle pin status of selected file
		this.addCommand({
			id: "toggle-pin-status-in-zen-space",
			name: "Toggle pin status of selected file in Zen Space",
			checkCallback: (checking: boolean) => {
				if (this.activeView) {
					const activeFile = this.app.workspace.getActiveFile();
					if (
						activeFile &&
						this.activeView.isInCurrentFolder(activeFile)
					) {
						if (!checking) {
							this.activeView.togglePinItem(activeFile.path);
						}
						return true;
					}
				}
				return false;
			},
		});
	}

	onunload() {
		console.log("Unloading ZenSpace plugin");

		// Remove all added buttons
		document
			.querySelectorAll(".zen-space-button")
			.forEach((el) => el.remove());
	}
}

class ZenSpaceSettingTab extends PluginSettingTab {
	plugin: ZenSpacePlugin;

	constructor(app: App, plugin: ZenSpacePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// File Creation Settings
		containerEl.createEl("h3", { text: "Index file " });

		new Setting(containerEl)
			.setName("Create index file")
			.setDesc(
				"Automatically create an Index file when opening a folder in Zen Space"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.createIndexFile)
					.onChange(async (value) => {
						this.plugin.settings.createIndexFile = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Use longform template")
			.setDesc(
				"Include longform YAML properties in the Index file (to create longform project for already available folder)"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useLongformTemplate)
					.onChange(async (value) => {
						this.plugin.settings.useLongformTemplate = value;
						await this.plugin.saveSettings();
					})
			);

		// Display Settings
		containerEl.createEl("h3", { text: "Other settings" });

		new Setting(containerEl)
			.setName("Include subfolders")
			.setDesc("Show subfolders in the Zen Space view")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeSubfolders)
					.onChange(async (value) => {
						this.plugin.settings.includeSubfolders = value;
						await this.plugin.saveSettings();
						if (this.plugin.activeView) {
							this.plugin.activeView.refreshView();
						}
					})
			);

		new Setting(containerEl)
			.setName("Include canvas files")
			.setDesc("Show canvas files in the Zen Space view")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeCanvasFiles)
					.onChange(async (value) => {
						this.plugin.settings.includeCanvasFiles = value;
						await this.plugin.saveSettings();
						if (this.plugin.activeView) {
							this.plugin.activeView.refreshView();
						}
					})
			);

		new Setting(containerEl)
			.setName("Include other formats")
			.setDesc(
				"Show non-markdown, non-canvas files in the Zen Space view"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeOtherFormats)
					.onChange(async (value) => {
						this.plugin.settings.includeOtherFormats = value;
						await this.plugin.saveSettings();
						if (this.plugin.activeView) {
							this.plugin.activeView.refreshView();
						}
					})
			);

		new Setting(containerEl)
			.setName("Hide file extensions")
			.setDesc("Hide file extensions and icons in the Zen Space view")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideFileExtensions)
					.onChange(async (value) => {
						this.plugin.settings.hideFileExtensions = value;
						await this.plugin.saveSettings();
						if (this.plugin.activeView) {
							this.plugin.activeView.refreshView();
						}
					})
			);

		new Setting(containerEl)
			.setName("Show search bar")
			.setDesc("Show a search bar in the Zen Space view")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showSearchBar)
					.onChange(async (value) => {
						this.plugin.settings.showSearchBar = value;
						await this.plugin.saveSettings();
						if (this.plugin.activeView) {
							this.plugin.activeView.refreshView(true);
						}
					})
			);

		new Setting(containerEl)
			.setName("Show quick actions")
			.setDesc(
				"Show quick action buttons (rename, delete, etc.) for files"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showQuickActions)
					.onChange(async (value) => {
						this.plugin.settings.showQuickActions = value;
						await this.plugin.saveSettings();
						if (this.plugin.activeView) {
							this.plugin.activeView.refreshView();
						}
					})
			);

		new Setting(containerEl)
			.setName("Show breadcrumbs")
			.setDesc(
				"Show navigation breadcrumbs at the top of the Zen Space view"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showBreadcrumbs)
					.onChange(async (value) => {
						this.plugin.settings.showBreadcrumbs = value;
						await this.plugin.saveSettings();
						if (this.plugin.activeView) {
							this.plugin.activeView.refreshView(true);
						}
					})
			);


		new Setting(containerEl)
			.setName("Default sort by")
			.setDesc("Choose how files are sorted by default")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("filename", "File Name")
					.addOption("created", "Creation Date")
					.addOption("modified", "Modified Date")
					.setValue(this.plugin.settings.defaultSortBy)
					.onChange(
						async (value: "filename" | "created" | "modified") => {
							this.plugin.settings.defaultSortBy = value;
							await this.plugin.saveSettings();
							if (this.plugin.activeView) {
								this.plugin.activeView.currentSortBy = value;
								this.plugin.activeView.refreshView();
							}
						}
					)
			);

		new Setting(containerEl)
			.setName("Default sort order")
			.setDesc("Choose the default sort order")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("asc", "Ascending")
					.addOption("desc", "Descending")
					.setValue(this.plugin.settings.defaultSortOrder)
					.onChange(async (value: "asc" | "desc") => {
						this.plugin.settings.defaultSortOrder = value;
						await this.plugin.saveSettings();
						if (this.plugin.activeView) {
							this.plugin.activeView.currentSortOrder = value;
							this.plugin.activeView.refreshView();
						}
					})
			);
	}
}
