import { App, TFolder, Notice, TFile } from "obsidian";

export class BaseFileCreator {
    constructor(private app: App) {}

    async createBaseFile(folder: TFolder) {
        const folderName = folder.name;
        const basePath = `${folder.path}/${folderName}.base`;

        // Check if base file already exists
        const existingFile = this.app.vault.getAbstractFileByPath(basePath);
        if (existingFile) {
            // If it exists, do nothing (do not update or overwrite)
            return;
        }

        // Create base file content
        const content = this.generateBaseFileContent(folder);

        try {
            await this.app.vault.create(basePath, content);
            new Notice(`Created Database file in ${folderName}`);
        } catch (error) {
            if (!(error instanceof Error && error.message.includes("already exists"))) {
                new Notice(`Error creating Database file: ${error}`);
            }
        }
    }

    // updateBaseFileContent is no longer used automatically
    // Keeping it for possible future manual use, but not called by plugin
    async updateBaseFileContent(folder: TFolder) {
        const folderName = folder.name;
        const basePath = `${folder.path}/${folderName}.base`;
        const baseFile = this.app.vault.getAbstractFileByPath(basePath);

        if (!baseFile || !(baseFile instanceof TFile)) {
            return;
        }

        try {
            const content = this.generateBaseFileContent(folder);
            await this.app.vault.modify(baseFile, content);
        } catch (error) {
            console.error("Error updating Database file:", error);
        }
    }

    private generateBaseFileContent(folder: TFolder): string {
        const folderPath = folder.path === "" ? "/" : folder.path;
        return `views:
  - type: table
    name: Table
    filters:
      and:
        - file.folder == "${folderPath}"
    order:
      - file.name
      - tags
      - created
      - updated
    columnSize:
      file.name: 352
      note.tags: 306
`;
    }
} 