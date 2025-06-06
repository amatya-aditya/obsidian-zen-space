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
	setIcon,
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
	pinnedItems: string[]; 
	useGridLayoutForIndex: boolean; 
	colorfulGridCards: boolean; 
	simpleGridStyle: boolean; 
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
	useGridLayoutForIndex: true, 
	colorfulGridCards: true, 
	simpleGridStyle: false, 
};


const ZEN_SPACE_VIEW_TYPE = "zen-space-view";

class ZenSpaceView extends ItemView {
	folder: TFolder;
	public contentEl: HTMLElement;
	private fileListContainer: HTMLElement;
	private plugin: ZenSpacePlugin;
	public currentSortBy: "filename" | "created" | "modified";
	public currentSortOrder: "asc" | "desc";
	private searchTerm = "";
	private expandedFolders: Set<string> = new Set(); 
	private folderHistory: TFolder[] = [];
	private historyIndex: number = -1;
	private backButton: HTMLButtonElement | null = null;
	private forwardButton: HTMLButtonElement | null = null;

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
		return `Zen Space ${this.folder.name}`;
	}

	getIcon(): string {
		return "target";
	}

	
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

	onload(): void {
		super.onload();
	}

	async onOpen(): Promise<void> {
		this.contentEl = this.containerEl.querySelector(
			".view-content"
		) as HTMLElement;
		this.contentEl.empty();

		
		if (this.plugin.settings.showBreadcrumbs) {
			this.renderBreadcrumbs();
		}

		
		const navBar = this.contentEl.createEl("div", {
			cls: "zen-space-nav-bar",
		});

		
		const controlsContainer = navBar.createEl("div", {
			cls: "zen-space-controls",
		});

		
		const sortButton = controlsContainer.createEl("button", {
			cls: "zen-space-sort-button",
			attr: { "aria-label": "Sort options" },
		});
		const sortIcon = sortButton.createEl('span', { cls: 'zen-space-icon' });
		setIcon(sortIcon, 'arrow-up-down');

		
		let sortMenu: HTMLDivElement | null = null;
		sortButton.addEventListener("click", (e) => {
			e.stopPropagation();
			if (sortMenu) {
				if (sortMenu) sortMenu.remove();
				sortMenu = null;
				return;
			}
			sortMenu = document.createElement("div");
			sortMenu.className = "zen-space-sort-menu";
			sortMenu.style.position = "absolute";
			sortMenu.style.zIndex = "1000";
			const rect = sortButton.getBoundingClientRect();
			sortMenu.style.left = rect.left + "px";
			sortMenu.style.top = rect.bottom + window.scrollY + "px";
			
			const options = [
				{ by: "filename", order: "asc", label: "File name (A to Z)" },
				{ by: "filename", order: "desc", label: "File name (Z to A)" },
				{ by: "modified", order: "desc", label: "Modified time (new to old)" },
				{ by: "modified", order: "asc", label: "Modified time (old to new)" },
				{ by: "created", order: "desc", label: "Created time (new to old)" },
				{ by: "created", order: "asc", label: "Created time (old to new)" },
			];
			options.forEach(opt => {
				const item = document.createElement("div");
				item.className = "zen-space-sort-menu-item" + (this.currentSortBy === opt.by && this.currentSortOrder === opt.order ? " is-active" : "");
				item.textContent = opt.label;
				item.addEventListener("click", () => {
					this.currentSortBy = opt.by as any;
					this.currentSortOrder = opt.order as any;
					this.refreshView();
					if (sortMenu) sortMenu.remove();
					sortMenu = null;
				});
				if (sortMenu) sortMenu.appendChild(item);
			});
			document.body.appendChild(sortMenu);
			
			const closeMenu = (ev: MouseEvent) => {
				if (!sortMenu) return;
				if (!sortMenu.contains(ev.target as Node)) {
					sortMenu.remove();
					sortMenu = null;
					document.removeEventListener("mousedown", closeMenu);
				}
			};
			setTimeout(() => document.addEventListener("mousedown", closeMenu), 0);
		});

		
		const newFolderButton = controlsContainer.createEl("button", {
			cls: "zen-space-new-folder-button",
			attr: {
				"aria-label": "New folder",
			},
		});
		const folderIcon = newFolderButton.createEl('span', { cls: 'zen-space-icon' });
		setIcon(folderIcon, 'folder-plus');

		newFolderButton.addEventListener("click", async () => {
			await this.createNewFolder();
		});

		
		const newCanvasButton = controlsContainer.createEl("button", {
			cls: "zen-space-new-canvas-button",
			attr: {
				"aria-label": "New canvas file",
			},
		});
		const canvasIcon = newCanvasButton.createEl('span', { cls: 'zen-space-icon' });
		setIcon(canvasIcon, 'layout-dashboard');

		newCanvasButton.addEventListener("click", async () => {
			await this.createNewCanvasFile();
		});

		
		const newFileButton = controlsContainer.createEl("button", {
			cls: "zen-space-new-file-button",
			attr: {
				"aria-label": "New file",
			},
		});
		const fileIcon = newFileButton.createEl('span', { cls: 'zen-space-icon' });
		setIcon(fileIcon, 'file-plus');

		newFileButton.addEventListener("click", async () => {
			await this.createNewFile();
		});

		
		// --- Back and Forward buttons ---
		this.backButton = controlsContainer.createEl("button", {
			cls: "zen-space-nav-back",
			attr: { "aria-label": "Back" },
		});
		setIcon(this.backButton, "arrow-left");
		this.backButton.disabled = this.historyIndex <= 0;
		this.backButton.addEventListener("click", () => {
			if (this.historyIndex > 0) {
				this.historyIndex--;
				this.folder = this.folderHistory[this.historyIndex];
				this.refreshView(true);
			}
		});

		this.forwardButton = controlsContainer.createEl("button", {
			cls: "zen-space-nav-forward",
			attr: { "aria-label": "Forward" },
		});
		setIcon(this.forwardButton, "arrow-right");
		this.forwardButton.disabled = this.historyIndex >= this.folderHistory.length - 1;
		this.forwardButton.addEventListener("click", () => {
			if (this.historyIndex < this.folderHistory.length - 1) {
				this.historyIndex++;
				this.folder = this.folderHistory[this.historyIndex];
				this.refreshView(true);
			}
		});

		
		if (this.plugin.settings.showSearchBar) {
			const searchContainer = this.contentEl.createEl("div", {
				cls: "zen-space-search-container",
			});

			const searchInput = searchContainer.createEl("input", {
				cls: "zen-space-search-input",
				attr: {
					placeholder: "Search files...",
					type: "text",
				},
			});

			const searchIcon = searchContainer.createEl('span', { cls: 'zen-space-search-icon' });
			setIcon(searchIcon, 'search');

			searchInput.addEventListener("input", (e) => {
				this.searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
				this.refreshView();
			});
		}

		
		this.fileListContainer = this.contentEl.createEl("div", {
			cls: "zen-space-file-list",
		});

		
		this.displayFolderContents(this.folder, this.fileListContainer, true);

		
		this.registerFileEvents();

		// After rendering, update button states
		this.updateNavButtons();
	}

	updateNavButtons() {
		if (this.backButton) this.backButton.disabled = this.historyIndex <= 0;
		if (this.forwardButton) this.forwardButton.disabled = this.historyIndex >= this.folderHistory.length - 1;
	}

	
	renderBreadcrumbs() {
		const breadcrumbs = this.contentEl.createEl("div", {
			cls: "zen-space-breadcrumbs",
		});

		
		const root = this.app.vault.getRoot();

		
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

		
		const rootItem = breadcrumbs.createEl("span", {
			text: "Root",
			cls: "zen-space-breadcrumb-item",
		});
		rootItem.addEventListener("click", () => {
			this.navigateToFolder(root);
		});

		
		if (path.length > 0) {
			breadcrumbs.createEl("span", {
				text: "/",
				cls: "zen-space-breadcrumb-separator",
			});
		}

		
		path.forEach((folder, index) => {
			const item = breadcrumbs.createEl("span", {
				text: folder.name,
				cls: "zen-space-breadcrumb-item",
			});

			item.addEventListener("click", () => {
				this.navigateToFolder(folder);
			});

			
			if (index < path.length - 1) {
				breadcrumbs.createEl("span", {
					text: "/",
					cls: "zen-space-breadcrumb-separator",
				});
			}
		});
	}

	
	isItemPinned(path: string): boolean {
		return this.plugin.settings.pinnedItems.includes(path);
	}

	
	async togglePinItem(path: string) {
		const pinnedItems = this.plugin.settings.pinnedItems;
		const isPinned = pinnedItems.includes(path);

		if (isPinned) {
			
			this.plugin.settings.pinnedItems = pinnedItems.filter(
				(item) => item !== path
			);
		} else {
			
			this.plugin.settings.pinnedItems.push(path);
		}

		
		await this.plugin.saveSettings();

		
		this.refreshView();
	}

	
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

	
	async createNewCanvasFile() {
		
		const timestamp = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.substring(0, 19);
		const suggestedName = `Canvas ${timestamp}.canvas`;

		try {
			const newFilePath = normalizePath(
				`${this.folder.path}/${suggestedName}`
			);
			
			const canvasData = {
				nodes: [],
				edges: [],
			};

			const newFile = await this.app.vault.create(
				newFilePath,
				JSON.stringify(canvasData, null, 2)
			);

			
			this.app.workspace.getLeaf().openFile(newFile);
			new Notice(`Canvas file created: ${suggestedName}`);
		} catch (error) {
			new Notice(`Error creating canvas file: ${error}`);
		}
	}

	
	navigateToFolder(folder: TFolder) {
		if (this.historyIndex === -1 || this.folder !== folder) {
			// If navigating to a new folder, update history
			this.folderHistory = this.folderHistory.slice(0, this.historyIndex + 1);
			this.folderHistory.push(folder);
			this.historyIndex = this.folderHistory.length - 1;
		}
		this.folder = folder;
		if (this.plugin.settings.createIndexFile) {
			this.plugin.createIndexFile(folder);
		}
		this.refreshView(true);
		this.updateNavButtons();
	}

	
	registerFileEvents() {
		
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

	
	isPathInCurrentFolder(path: string): boolean {
		if (!this.plugin.settings.includeSubfolders) {
			return (
				path.startsWith(this.folder.path + "/") &&
				!path.substring(this.folder.path.length + 1).includes("/")
			);
		}

		return path.startsWith(this.folder.path + "/");
	}

	
	async createNewFile() {
		
		const timestamp = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.substring(0, 19);
		const suggestedName = `Untitled ${timestamp}.md`;

		
		try {
			const newFilePath = normalizePath(
				`${this.folder.path}/${suggestedName}`
			);
			const newFile = await this.app.vault.create(newFilePath, "");

			
			if (this.plugin.settings.createIndexFile) {
				await this.plugin.updateIndexFileContent(this.folder);
			}

			
			const leaf = this.app.workspace.getLeaf();
			await leaf.openFile(newFile);

			
			const activeView =
				this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView?.editor) {
				activeView.editor.focus();
			}
		} catch (error) {
			new Notice(`Error creating new file: ${error}`);
		}
	}

	
	async createNewFileInFolder(folder: TFolder) {
		
		const timestamp = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.substring(0, 19);
		const suggestedName = `Untitled ${timestamp}.md`;

		
		try {
			const newFilePath = normalizePath(
				`${folder.path}/${suggestedName}`
			);
			const newFile = await this.app.vault.create(newFilePath, "");

			
			if (this.plugin.settings.createIndexFile) {
				await this.plugin.updateIndexFileContent(folder);
			}

			
			const leaf = this.app.workspace.getLeaf();
			await leaf.openFile(newFile);

			
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

	
	async createNewCanvasFileInFolder(folder: TFolder) {
		
		const timestamp = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.substring(0, 19);
		const suggestedName = `Canvas ${timestamp}.canvas`;

		try {
			const newFilePath = normalizePath(
				`${folder.path}/${suggestedName}`
			);
			
			const canvasData = {
				nodes: [],
				edges: [],
			};

			const newFile = await this.app.vault.create(
				newFilePath,
				JSON.stringify(canvasData, null, 2)
			);

			
			this.app.workspace.getLeaf().openFile(newFile);
			new Notice(`Canvas file created: ${suggestedName}`);
		} catch (error) {
			new Notice(`Error creating canvas file: ${error}`);
		}
	}

	
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

	
	refreshView(fullRefresh = false) {
		if (fullRefresh) {
			
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

	
	getFileTime(file: TFile, type: "created" | "modified"): number {
		if (type === "created") {
			return file.stat.ctime;
		} else {
			return file.stat.mtime;
		}
	}

	
	formatDisplayName(file: TAbstractFile): string {
		if (file instanceof TFolder) {
			return file.name;
		}

		if (this.plugin.settings.hideFileExtensions && file instanceof TFile) {
			
			return file.name.slice(0, -(file.extension.length + 1));
		}

		return file.name;
	}

	
	shouldIncludeFile(file: TAbstractFile): boolean {
		if (file instanceof TFolder) {
			return this.plugin.settings.includeSubfolders;
		}

		
		if (file instanceof TFile) {
			
			if (file.extension === "canvas") {
				return this.plugin.settings.includeCanvasFiles;
			}

			
			if (file.extension === "md") {
				return true;
			}

			
			return this.plugin.settings.includeOtherFormats;
		}

		return false;
	}

	
	matchesSearch(file: TAbstractFile): boolean {
		if (!this.searchTerm) return true;

		return file.name.toLowerCase().includes(this.searchTerm);
	}

	
	showFolderContextMenu(folder: TFolder, event: MouseEvent) {
		const menu = new Menu();

		
		menu.addItem((item) => {
			item.setTitle("Open in Zen Space")
				.setIcon("target")
				.onClick(async () => {
					this.navigateToFolder(folder);
				});
		});

		
		const isPinned = this.isItemPinned(folder.path);
		menu.addItem((item) => {
			item.setTitle(isPinned ? "Unpin folder" : "Pin folder")
				.setIcon(isPinned ? "pin-off" : "pin")
				.onClick(async () => {
					await this.togglePinItem(folder.path);
				});
		});

		
		menu.addItem((item) => {
			item.setTitle("New file")
				.setIcon("file-plus")
				.onClick(async () => {
					await this.createNewFileInFolder(folder);
				});
		});

		
		menu.addItem((item) => {
			item.setTitle("New canvas")
				.setIcon("layout-dashboard")
				.onClick(async () => {
					await this.createNewCanvasFileInFolder(folder);
				});
		});

		
		menu.addItem((item) => {
			item.setTitle("New subfolder")
				.setIcon("folder-plus")
				.onClick(async () => {
					await this.createNewSubfolder(folder);
				});
		});

		
		menu.addSeparator();

		
		menu.addItem((item) => {
			item.setTitle("Rename")
				.setIcon("pencil")
				.onClick(async () => {
					await this.renameFolder(folder);
				});
		});

		
		menu.addItem((item) => {
			item.setTitle("Delete")
				.setIcon("trash")
				.onClick(async () => {
					await this.deleteFolder(folder);
				});
		});

		
		menu.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	
	showFileContextMenu(file: TFile, event: MouseEvent) {
		const menu = new Menu();

		
		menu.addItem((item) => {
			item.setTitle("Open")
				.setIcon("file")
				.onClick(() => {
					this.app.workspace.getLeaf().openFile(file);
				});
		});

		
		menu.addItem((item) => {
			item.setTitle("Open in new tab")
				.setIcon("file-plus")
				.onClick(() => {
					this.app.workspace.getLeaf("tab").openFile(file);
				});
		});

		
		menu.addItem((item) => {
			item.setTitle("Open in new pane")
				.setIcon("split")
				.onClick(() => {
					this.app.workspace.getLeaf("split").openFile(file);
				});
		});

		
		const isPinned = this.isItemPinned(file.path);
		menu.addItem((item) => {
			item.setTitle(isPinned ? "Unpin file" : "Pin file")
				.setIcon(isPinned ? "pin-off" : "pin")
				.onClick(async () => {
					await this.togglePinItem(file.path);
				});
		});

		
		menu.addSeparator();

		
		menu.addItem((item) => {
			item.setTitle("Rename")
				.setIcon("pencil")
				.onClick(async () => {
					await this.renameFile(file);
				});
		});

		
		menu.addItem((item) => {
			item.setTitle("Delete")
				.setIcon("trash")
				.onClick(async () => {
					await this.deleteFile(file);
				});
		});

		
		menu.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	displayFolderContents(
		folder: TFolder,
		container: HTMLElement,
		isRootFolder = false,
		depth = 0
	) {
		
		let filesToDisplay = folder.children.filter((file) => {
			
			if (isRootFolder && file instanceof TFolder) {
				return this.plugin.settings.includeSubfolders;
			}

			
			
			if (!isRootFolder && file instanceof TFolder) {
				return false;
			}

			return this.shouldIncludeFile(file) && this.matchesSearch(file);
		});

		
		if (filesToDisplay.length === 0 && !isRootFolder) {
			return;
		}

		
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

		
		for (const file of filesToDisplay) {
			const fileItem = container.createEl("div", {
				cls: isRootFolder && !(file instanceof TFolder) ? 
					"zen-space-file-item zen-space-depth-r" : 
					`zen-space-file-item zen-space-depth-${depth}`,
			});

			
			if (this.isItemPinned(file.path)) {
				fileItem.addClass("zen-space-pinned-item");
			}

			
			if (file instanceof TFolder) {
				fileItem.addClass("zen-space-folder-item");

				
				const toggleIcon = fileItem.createEl('span', { cls: 'zen-space-icon' });
				const isExpanded = this.expandedFolders.has(file.path);
				setIcon(toggleIcon, isExpanded ? 'chevron-down' : 'chevron-right');

				toggleIcon.addEventListener("click", (e) => {
					e.stopPropagation();
					if (isExpanded) {
						this.expandedFolders.delete(file.path);
					} else {
						this.expandedFolders.add(file.path);
					}
					this.refreshView();
				});

				
				if (!this.plugin.settings.hideFileExtensions) {
					const folderIcon = fileItem.createEl('span', { cls: 'zen-space-icon' });
					setIcon(folderIcon, 'folder');
				}

				const nameContainer = fileItem.createEl("div", {
					cls: "zen-space-name-container",
				});
				nameContainer.createEl("span", {
					text: this.formatDisplayName(file),
					cls: "zen-space-item-name zen-space-file-name",
				});

				
				const childContainer = container.createEl("div", {
					cls: "zen-space-subfolder-container",
				});

				
				childContainer.classList.toggle('zen-space-expanded', this.expandedFolders.has(file.path));

				
				if (this.expandedFolders.has(file.path)) {
					if (file instanceof TFolder) {
						this.displayFolderContents(file, childContainer, false, depth + 1);
					}
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

				
				fileItem.addEventListener("contextmenu", (e) => {
					e.preventDefault();
					this.showFolderContextMenu(file as TFolder, e);
				});

				
				if (this.plugin.settings.showQuickActions) {
					this.addFolderActions(fileItem, file as TFolder);
				}
			} else if (file instanceof TFile) {
				
				if (!this.plugin.settings.hideFileExtensions) {
					const fileIcon = fileItem.createEl('span', { cls: 'zen-space-icon' });
					setIcon(fileIcon, file.extension === 'md' ? 'file-text' : 
										file.extension === 'canvas' ? 'layout-dashboard' : 'file');
				}

				const nameContainer = fileItem.createEl("div", {
					cls: "zen-space-name-container",
				});

				
				nameContainer.createEl("span", {
					text: this.formatDisplayName(file),
					cls: "zen-space-item-name zen-space-file-name",
				});

				
				if (
					!this.plugin.settings.hideFileExtensions &&
					file.extension !== "md"
				) {
					nameContainer.createEl("span", {
						text: file.extension.toUpperCase(),
						cls: "zen-space-extension-badge",
					});
				}

				
				fileItem.addEventListener("click", (e) => {
					
					if (
						!(e.target as HTMLElement).closest(
							".zen-space-file-action-button"
						)
					) {
						this.app.workspace.getLeaf().openFile(file);
					}
				});

				
				fileItem.addEventListener("contextmenu", (e) => {
					e.preventDefault();
					this.showFileContextMenu(file, e);
				});

				
				if (this.plugin.settings.showQuickActions) {
					this.addFileActions(fileItem, file);
				}
			}
		}
	}

	
	addFileActions(fileItem: HTMLElement, file: TFile) {
		const actionsContainer = fileItem.createEl("div", {
			cls: "zen-space-file-actions",
		});

		
		const openInPaneButton = actionsContainer.createEl("button", {
			cls: "zen-space-file-action-button",
			attr: {
				"aria-label": "Open in new pane",
			},
		});
		const openInPaneIcon = openInPaneButton.createEl('span', { cls: 'zen-space-icon' });
		setIcon(openInPaneIcon, 'split');

		openInPaneButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.app.workspace.getLeaf("split").openFile(file);
		});

		
		const isPinned = this.isItemPinned(file.path);
		const pinButton = actionsContainer.createEl("button", {
			cls:
				"zen-space-file-action-button" + (isPinned ? " is-pinned" : ""),
			attr: {
				"aria-label": isPinned ? "Unpin file" : "Pin file",
			},
		});
		const pinIcon = pinButton.createEl('span', { cls: 'zen-space-icon' });
		setIcon(pinIcon, isPinned ? 'pin' : 'pin-off');

		pinButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.togglePinItem(file.path);
		});

		
		const renameButton = actionsContainer.createEl("button", {
			cls: "zen-space-file-action-button",
			attr: {
				"aria-label": "Rename file",
			},
		});
		const renameIcon = renameButton.createEl('span', { cls: 'zen-space-icon' });
		setIcon(renameIcon, 'pencil');

		renameButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.renameFile(file);
		});

		
		const deleteButton = actionsContainer.createEl("button", {
			cls: "zen-space-file-action-button",
			attr: {
				"aria-label": "Delete file",
			},
		});
		const deleteIcon = deleteButton.createEl('span', { cls: 'zen-space-icon' });
		setIcon(deleteIcon, 'trash');

		deleteButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.deleteFile(file);
		});
	}

	
	addFolderActions(fileItem: HTMLElement, folder: TFolder) {
		const actionsContainer = fileItem.createEl("div", {
			cls: "zen-space-file-actions",
		});

		
		const isPinned = this.isItemPinned(folder.path);
		const pinButton = actionsContainer.createEl("button", {
			cls:
				"zen-space-file-action-button" + (isPinned ? " is-pinned" : ""),
			attr: {
				"aria-label": isPinned ? "Unpin folder" : "Pin folder",
			},
		});
		const pinIcon = pinButton.createEl('span', { cls: 'zen-space-icon' });
		setIcon(pinIcon, isPinned ? 'pin' : 'pin-off');

		pinButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.togglePinItem(folder.path);
		});

		
		const newFileButton = actionsContainer.createEl("button", {
			cls: "zen-space-file-action-button",
			attr: {
				"aria-label": "New file in folder",
			},
		});
		const newFileIcon = newFileButton.createEl('span', { cls: 'zen-space-icon' });
		setIcon(newFileIcon, 'file-plus');

		newFileButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.createNewFileInFolder(folder);
		});

		
		const openButton = actionsContainer.createEl("button", {
			cls: "zen-space-file-action-button",
			attr: {
				"aria-label": "Open in Zen Space",
			},
		});
		const openIcon = openButton.createEl('span', { cls: 'zen-space-icon' });
		setIcon(openIcon, 'target');

		openButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.navigateToFolder(folder);
		});
	}

	
	async renameFolder(folder: TFolder) {
		const currentName = folder.name;

		
		const newName = await new Promise<string | null>((resolve) => {
			new FolderNameModal(
				this.app,
				"Enter new folder name",
				resolve
			).open();
		});

		if (newName && newName !== currentName) {
			try {
				
				new Notice(`Folder renamed to ${newName}`);

				
				const oldPath = folder.path;
				const newPath = folder.parent
					? `${folder.parent.path}/${newName}`
					: newName;

				
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

	
	async deleteFolder(folder: TFolder) {
		const message = `Are you sure you want to delete "${folder.name}" and all its contents?`;
		new ConfirmModal(this.app, message, async () => {
			try {
				
				this.plugin.settings.pinnedItems = this.plugin.settings.pinnedItems.filter(
					(item) => !item.startsWith(folder.path + "/") && item !== folder.path
				);
				await this.app.vault.delete(folder, true);
				await this.plugin.saveSettings();
				new Notice(`Folder deleted: ${folder.name}`);
				this.refreshView();
			} catch (error) {
				new Notice(`Error deleting folder: ${error}`);
			}
		}).open();
	}

	
	async renameFile(file: TFile) {
		const currentName = file.name;
		const oldFolder = file.parent;
		const oldPath = file.path;

		
		const newName = await new Promise<string | null>((resolve) => {
			new FolderNameModal(
				this.app,
				"Enter new file name",
				resolve
			).open();
		});

		if (newName && newName !== currentName) {
			try {
				
				new Notice(`File renamed to ${newName}`);

				
				const newPath = file.parent
					? `${file.parent.path}/${newName}`
					: newName;
				this.plugin.settings.pinnedItems =
					this.plugin.settings.pinnedItems.map((item) =>
						item === oldPath ? newPath : item
					);

				await this.plugin.saveSettings();

				
				if (this.plugin.settings.createIndexFile) {
					
					if (file.parent !== oldFolder && oldFolder) {
						await this.plugin.updateIndexFileContent(oldFolder);
					}

					
					if (file.parent) {
						await this.plugin.updateIndexFileContent(file.parent);
					}
				}
			} catch (error) {
				new Notice(`Error renaming file: ${error}`);
			}
		}
	}

	
	async deleteFile(file: TFile) {
		const message = `Are you sure you want to delete "${file.name}"?`;
		new ConfirmModal(this.app, message, async () => {
			const folder = file.parent;
			try {
				
				if (this.isItemPinned(file.path)) {
					this.plugin.settings.pinnedItems = this.plugin.settings.pinnedItems.filter(
						(item) => item !== file.path
					);
					await this.plugin.saveSettings();
				}
				await this.app.vault.delete(file);
				new Notice(`File deleted: ${file.name}`);
				
				if (this.plugin.settings.createIndexFile && folder) {
					await this.plugin.updateIndexFileContent(folder);
				}
				this.refreshView();
			} catch (error) {
				new Notice(`Error deleting file: ${error}`);
			}
		}).open();
	}

	
	sortFiles(files: TAbstractFile[]): TAbstractFile[] {
		return files.sort((a, b) => {
			const aPinned = this.isItemPinned(a.path);
			const bPinned = this.isItemPinned(b.path);
			if (aPinned && !bPinned) return -1;
			if (!aPinned && bPinned) return 1;
			if (a instanceof TFolder && !(b instanceof TFolder)) return -1;
			if (!(a instanceof TFolder) && b instanceof TFolder) return 1;
			let comparison = 0;
			if (this.currentSortBy === "filename") {
				comparison = naturalCompare(a.name, b.name);
			} else if (a instanceof TFile && b instanceof TFile) {
				comparison = this.getFileTime(a, this.currentSortBy) - this.getFileTime(b, this.currentSortBy);
			}
			return this.currentSortOrder === "asc" ? comparison : -comparison;
		});
	}
}


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


class ConfirmModal extends Modal {
	private message: string;
	private onConfirm: () => void;

	constructor(app: App, message: string, onConfirm: () => void) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Confirm Deletion' });
		contentEl.createEl('p', { text: this.message });
		const buttonContainer = contentEl.createEl('div', { cls: 'zen-space-modal-button-container' });
		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => this.close());
		const confirmButton = buttonContainer.createEl('button', { text: 'Delete' });
		confirmButton.addEventListener('click', () => {
			this.onConfirm();
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export default class ZenSpacePlugin extends Plugin {
	settings: ZenSpaceSettings;
	ribbonIcon: HTMLElement | null = null;

	
	public getActiveZenSpaceView(): ZenSpaceView | null {
		const leaves = this.app.workspace.getLeavesOfType(ZEN_SPACE_VIEW_TYPE);
		if (leaves.length > 0) {
			const view = leaves[0].view;
			if (view instanceof ZenSpaceView) {
				return view;
			}
		}
		return null;
	}

	async onload() {
		console.log("Loading ZenSpace plugin");

		
		await this.loadSettings();
		
		
		this.updateGridLayoutClasses();

		
		this.registerView(ZEN_SPACE_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
			return new ZenSpaceView(leaf, this.app.vault.getRoot(), this);
		});

		
		this.addSettingTab(new ZenSpaceSettingTab(this.app, this));

		
		this.ribbonIcon = this.addRibbonIcon(
			"target",
			"Open Zen Space",
			async (evt) => {
				await this.openInZenSpace(this.app.vault.getRoot());
			}
		);

		
		this.addCommands();

		
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

		
		this.registerIndexFileUpdateEvents();

		
		this.registerInterval(
			window.setInterval(() => {
				this.addZenSpaceButtons();
			}, 1000)
		);

		
		const fileExplorer = document.querySelector(".nav-files-container");
		if (fileExplorer) {
			const observer = new MutationObserver(() => {
				setTimeout(() => this.addZenSpaceButtons(), 100);
			});
			observer.observe(fileExplorer, { childList: true, subtree: true });
			this.register(() => observer.disconnect());
		}

		
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

		
		this.setupMutationObserver();

		
		for (const delay of [100, 300, 500, 1000, 2000]) {
			setTimeout(() => {
				this.addZenSpaceButtons();
			}, delay);
		}

		
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
		this.updateGridLayoutClasses();
	}
	
	
	updateGridLayoutClasses() {
		
		if (this.settings.colorfulGridCards) {
			document.body.classList.add('colorful-zen-grid');
		} else {
			document.body.classList.remove('colorful-zen-grid');
		}
		
		if (this.settings.simpleGridStyle) {
			document.body.classList.add('simple-zen-grid');
		} else {
			document.body.classList.remove('simple-zen-grid');
		}
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
		
		if (this.settings.createIndexFile) {
			await this.createIndexFile(folder);
		}

		
		let leaf = this.app.workspace.getLeavesOfType(ZEN_SPACE_VIEW_TYPE)[0];

		
		if (!leaf) {
			const leftLeaf = this.app.workspace.getLeftLeaf(false);
			if (!leftLeaf) {
				throw new Error("Failed to get a left workspace leaf.");
			}
			leaf = leftLeaf;
		}

		
		await leaf.setViewState({
			type: ZEN_SPACE_VIEW_TYPE,
			state: { folder: folder.path },
		});

		
		const view = leaf.view as ZenSpaceView;
		if (view) {
			view.folder = folder;
			await view.onOpen(); 
		}

		
		this.app.workspace.revealLeaf(leaf);

		
		this.markFolderAsZenSpace(folder);
	}

	
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

	
	private getAllFilesInFolder(folder: TFolder): { files: TFile[], subfolders: Map<string, TFile[]> } {
		let files: TFile[] = [];
		let subfolders = new Map<string, TFile[]>();
		
		// Add files from current folder
		files = files.concat(folder.children.filter((file): file is TFile => file instanceof TFile));
		
		// If includeSubfolders is enabled, recursively add files from subfolders
		if (this.settings.includeSubfolders) {
			folder.children.forEach(child => {
				if (child instanceof TFolder) {
					const subfolderFiles = this.getAllFilesInFolder(child);
					subfolders.set(child.path, subfolderFiles.files);
					// Merge subfolder maps
					subfolderFiles.subfolders.forEach((files, path) => {
						subfolders.set(path, files);
					});
				}
			});
		}
		
		return { files, subfolders };
	}

	async createIndexFile(folder: TFolder) {
		const folderName = folder.name;
		const indexPath = `${folder.path}/Index.md`;

		// Check if index file already exists
		const existingFile = this.app.vault.getAbstractFileByPath(indexPath);
		if (existingFile instanceof TFile) {
			// If it exists, update its content
			await this.updateIndexFileContent(folder);
			new Notice(`Updated Index file in ${folderName}`);
			return;
		}

		const today = new Date();
		const formattedDate = today.toISOString().split("T")[0];

		// Get all files in the folder and its subfolders if includeSubfolders is enabled
		const { files, subfolders } = this.getAllFilesInFolder(folder);
		
		// Filter and process files
		const currentFolderFiles = files
			.filter(file => file.extension === "md" && file.name !== "Index.md")
			.map(file => file.name.replace(/\.md$/, ""))
			.sort();

		// Add CSS class for grid layout if enabled
		const cssClass = this.settings.useGridLayoutForIndex ? "zen-grid" : "";

		// Create content sections
		let content = "";
		if (this.settings.useLongformTemplate) {
			// Create YAML for scenes
			const allFiles = [...currentFolderFiles];
			subfolders.forEach(files => {
				files.forEach(file => {
					if (file.extension === "md" && file.name !== "Index.md") {
						allFiles.push(file.name.replace(/\.md$/, ""));
					}
				});
			});
			const uniqueFiles = [...new Set(allFiles)].sort();
			const scenesYAML = uniqueFiles
				.map((filename) => `    - ${filename}`)
				.join("\n");

			content = `---
cssclass: ${cssClass}
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
${currentFolderFiles.length > 0 ? currentFolderFiles.map((file) => `- [[${file}]]`).join("\n") : ""}

${this.settings.includeSubfolders ? Array.from(subfolders.entries()).map(([path, files]) => {
	const folderName = path.split("/").pop();
	const depth = path.split("/").length - folder.path.split("/").length;
	const headingLevel = "#".repeat(depth + 1); // +1 because root is #
	const fileList = files
		.filter(file => file.extension === "md" && file.name !== "Index.md")
		.map(file => file.name.replace(/\.md$/, ""))
		.sort();
	return fileList.length > 0 ? `${headingLevel} ${folderName}\n${fileList.map(file => `- [[${file}]]`).join("\n")}` : "";
}).filter(Boolean).join("\n\n") : ""}`;
		} else {
			content = `---
cssclass: ${cssClass}
title: ${folderName}
created: ${formattedDate}
updated: ${formattedDate}
---

# ${folderName}
${currentFolderFiles.length > 0 ? currentFolderFiles.map((file) => `- [[${file}]]`).join("\n") : ""}

${this.settings.includeSubfolders ? Array.from(subfolders.entries()).map(([path, files]) => {
	const folderName = path.split("/").pop();
	const depth = path.split("/").length - folder.path.split("/").length;
	const headingLevel = "#".repeat(depth + 1); // +1 because root is #
	const fileList = files
		.filter(file => file.extension === "md" && file.name !== "Index.md")
		.map(file => file.name.replace(/\.md$/, ""))
		.sort();
	return fileList.length > 0 ? `${headingLevel} ${folderName}\n${fileList.map(file => `- [[${file}]]`).join("\n")}` : "";
}).filter(Boolean).join("\n\n") : ""}`;
		}

		try {
			await this.app.vault.create(indexPath, content);
			new Notice(`Created Index file in ${folderName}`);
		} catch (error) {
			// Only show error notice if it's not because the file already exists
			if (!(error instanceof Error && error.message.includes("already exists"))) {
				new Notice(`Error creating Index file: ${error}`);
			}
		}
	}

	async updateIndexFileContent(folder: TFolder) {
		const indexPath = `${folder.path}/Index.md`;
		const indexFile = this.app.vault.getAbstractFileByPath(indexPath);

		if (!indexFile || !(indexFile instanceof TFile)) {
			return;
		}

		try {
			// Read current content
			let content = await this.app.vault.read(indexFile);

			// Get all files in the folder and its subfolders if includeSubfolders is enabled
			const { files, subfolders } = this.getAllFilesInFolder(folder);
			
			// Filter and process files
			const currentFolderFiles = files
				.filter(file => file.extension === "md" && file.name !== "Index.md")
				.map(file => file.name.replace(/\.md$/, ""))
				.sort();

			// Update the date
			const today = new Date();
			const formattedDate = today.toISOString().split("T")[0];

			// Add CSS class for grid layout if enabled
			const cssClass = this.settings.useGridLayoutForIndex ? "zen-grid" : "";

			// Update frontmatter
			await this.app.fileManager.processFrontMatter(indexFile, (frontmatter) => {
				frontmatter.updated = formattedDate;
				frontmatter.cssclass = cssClass;

				if (this.settings.useLongformTemplate) {
					const allFiles = [...currentFolderFiles];
					subfolders.forEach(files => {
						files.forEach(file => {
							if (file.extension === "md" && file.name !== "Index.md") {
								allFiles.push(file.name.replace(/\.md$/, ""));
							}
						});
					});
					const uniqueFiles = [...new Set(allFiles)].sort();
					
					if (!frontmatter.longform) {
						frontmatter.longform = {
							format: "scenes",
							title: folder.name,
							workflow: "Default Workflow",
							sceneFolder: "/",
							scenes: uniqueFiles,
							ignoredFiles: ["Index"]
						};
					} else {
						frontmatter.longform.scenes = uniqueFiles;
					}
				}
			});

			// Create the new content
			const newContent = `---
cssclass: ${cssClass}
title: ${folder.name}
created: ${formattedDate}
updated: ${formattedDate}
---

# ${folder.name}
${currentFolderFiles.length > 0 ? currentFolderFiles.map((file) => `- [[${file}]]`).join("\n") : ""}

${this.settings.includeSubfolders ? Array.from(subfolders.entries()).map(([path, files]) => {
	const folderName = path.split("/").pop();
	const depth = path.split("/").length - folder.path.split("/").length;
	const headingLevel = "#".repeat(depth + 1); // +1 because root is #
	const fileList = files
		.filter(file => file.extension === "md" && file.name !== "Index.md")
		.map(file => file.name.replace(/\.md$/, ""))
		.sort();
	return fileList.length > 0 ? `${headingLevel} ${folderName}\n${fileList.map(file => `- [[${file}]]`).join("\n")}` : "";
}).filter(Boolean).join("\n\n") : ""}`;

			await this.app.vault.modify(indexFile, newContent);
		} catch (error) {
			console.error("Error updating Index file:", error);
		}
	}

	
	registerIndexFileUpdateEvents() {
		
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
		
		const folderTitles = document.querySelectorAll(".nav-folder-title");

		folderTitles.forEach((folderTitleEl) => {
			
			if (folderTitleEl.querySelector(".zen-space-button")) {
				return;
			}

			
			const folderPath = folderTitleEl.getAttribute("data-path");
			if (!folderPath) {
				return;
			}

			
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!(folder instanceof TFolder)) {
				return;
			}

			
			const buttonEl = document.createElement("div");
			buttonEl.className = "zen-space-button";
			buttonEl.setAttribute("aria-label", "Open in Zen Space");
			const icon = buttonEl.createEl('span', { cls: 'zen-space-icon' });
			setIcon(icon, 'target');

			
			buttonEl.addEventListener("click", async (event) => {
				event.stopPropagation();
				await this.openInZenSpace(folder);
			});

			
			folderTitleEl.appendChild(buttonEl);

			
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

	
	addCommands() {
		
		this.addCommand({
			id: "open-current-folder",
			name: "Open current folder",
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

		
		this.addCommand({
			id: "create-new-file",
			name: "Create new file",
			checkCallback: (checking: boolean) => {
				const view = this.getActiveZenSpaceView();
				if (view) {
					if (!checking) {
						view.createNewFile();
					}
					return true;
				}
				return false;
			},
		});

		
		this.addCommand({
			id: "create-new-folder",
			name: "Create new folder",
			checkCallback: (checking: boolean) => {
				const view = this.getActiveZenSpaceView();
				if (view) {
					if (!checking) {
						view.createNewFolder();
					}
					return true;
				}
				return false;
			},
		});

		
		this.addCommand({
			id: "create-new-canvas",
			name: "Create new Canvas",
			checkCallback: (checking: boolean) => {
				const view = this.getActiveZenSpaceView();
				if (view) {
					if (!checking) {
						view.createNewCanvasFile();
					}
					return true;
				}
				return false;
			},
		});

		
		this.addCommand({
			id: "toggle-pin-status",
			name: "Toggle pin status",
			checkCallback: (checking: boolean) => {
				const view = this.getActiveZenSpaceView();
				if (view) {
					const activeFile = this.app.workspace.getActiveFile();
					if (
						activeFile &&
						view.isInCurrentFolder(activeFile)
					) {
						if (!checking) {
							view.togglePinItem(activeFile.path);
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

		
		document
			.querySelectorAll(".zen-space-button")
			.forEach((el) => el.remove());
		
		
		document.body.classList.remove('colorful-zen-grid');
		document.body.classList.remove('simple-zen-grid');
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

		
		new Setting(containerEl)
			.setName("Index file")
			.setHeading();

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
	
		new Setting(containerEl)
			.setName("Use grid layout for Index files")
			.setDesc("Display files in a grid layout for a more visual and elegant presentation")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useGridLayoutForIndex)
					.onChange(async (value) => {
						this.plugin.settings.useGridLayoutForIndex = value;
						await this.plugin.saveSettings();
						
						
						if (value) {
							new Notice("Grid layout enabled. Reopen folders in Zen Space to update index files.");
						} else {
							new Notice("Grid layout disabled. Reopen folders in Zen Space to update index files.");
						}
					})
			);
			

		
		new Setting(containerEl)
			.setName("Simple grid style")
			.setDesc("Remove top border colors from grid cards for a cleaner look")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.simpleGridStyle)
					.onChange(async (value) => {
						this.plugin.settings.simpleGridStyle = value;
						await this.plugin.saveSettings();
					})
			);

		
		new Setting(containerEl)
			.setName("Include files from subfolders")
			.setDesc("Include files from subfolders in both the Zen Space view and index files")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeSubfolders)
					.onChange(async (value) => {
						this.plugin.settings.includeSubfolders = value;
						await this.plugin.saveSettings();
						if (this.plugin.getActiveZenSpaceView()) {
							this.plugin.getActiveZenSpaceView()!.refreshView();
						}
					})
			);

		new Setting(containerEl)
			.setName("Include Canvas files")
			.setDesc("Show Canvas files in the Zen Space view")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeCanvasFiles)
					.onChange(async (value) => {
						this.plugin.settings.includeCanvasFiles = value;
						await this.plugin.saveSettings();
						if (this.plugin.getActiveZenSpaceView()) {
							this.plugin.getActiveZenSpaceView()!.refreshView();
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
						if (this.plugin.getActiveZenSpaceView()) {
							this.plugin.getActiveZenSpaceView()!.refreshView();
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
						if (this.plugin.getActiveZenSpaceView()) {
							this.plugin.getActiveZenSpaceView()!.refreshView();
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
						if (this.plugin.getActiveZenSpaceView()) {
							this.plugin.getActiveZenSpaceView()!.refreshView(true);
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
						if (this.plugin.getActiveZenSpaceView()) {
							this.plugin.getActiveZenSpaceView()!.refreshView();
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
						if (this.plugin.getActiveZenSpaceView()) {
							this.plugin.getActiveZenSpaceView()!.refreshView(true);
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
							if (this.plugin.getActiveZenSpaceView()) {
								this.plugin.getActiveZenSpaceView()!.currentSortBy = value;
								this.plugin.getActiveZenSpaceView()!.refreshView();
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
						if (this.plugin.getActiveZenSpaceView()) {
							this.plugin.getActiveZenSpaceView()!.currentSortOrder = value;
							this.plugin.getActiveZenSpaceView()!.refreshView();
						}
					})
			);
	}
}

function naturalCompare(a: string, b: string): number {
	// Split strings into digit and non-digit parts
	const ax: [number, string][] = [];
	const bx: [number, string][] = [];
	a.replace(/(\d+)|(\D+)/g, (_, $1, $2) => { ax.push([$1 ? parseInt($1, 10) : Infinity, $2 || ""]); return ''; });
	b.replace(/(\d+)|(\D+)/g, (_, $1, $2) => { bx.push([$1 ? parseInt($1, 10) : Infinity, $2 || ""]); return ''; });
	while (ax.length && bx.length) {
		const an = ax.shift()!;
		const bn = bx.shift()!;
		const nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
		if (nn) return nn;
	}
	return ax.length - bx.length;
}
