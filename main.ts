import { App, Plugin, TFile, TAbstractFile, PluginSettingTab, Setting } from "obsidian";

interface StatusMapping {
    emoji: string;
    enabled: boolean;
}

interface StatusIconPluginSettings {
    statusMappings: { [key: string]: StatusMapping };
}

const DEFAULT_SETTINGS: StatusIconPluginSettings = {
    statusMappings: {
        "todo": { emoji: "🔲", enabled: true },
        "incomplete": { emoji: "🟡", enabled: true },
        "done": { emoji: "✅", enabled: true },
        "canceled": { emoji: "❌", enabled: true },
        "forwarded": { emoji: "➡️", enabled: true },
        "scheduling": { emoji: "📅", enabled: true },
        "question": { emoji: "❓", enabled: true },
        "important": { emoji: "⚠️", enabled: true },
        "star": { emoji: "⭐", enabled: true },
        "quote": { emoji: "💬", enabled: true },
        "location": { emoji: "📍", enabled: true },
        "bookmark": { emoji: "🔖", enabled: true },
        "information": { emoji: "ℹ️", enabled: true },
        "savings": { emoji: "💰", enabled: true },
        "idea": { emoji: "💡", enabled: true },
        "pros": { emoji: "👍", enabled: true },
        "cons": { emoji: "👎", enabled: true },
        "fire": { emoji: "🔥", enabled: true },
        "key": { emoji: "🔑", enabled: true },
        "win": { emoji: "🏆", enabled: true },
        "up": { emoji: "⬆️", enabled: true },
        "down": { emoji: "⬇️", enabled: true }
    }
};

export default class StatusIconPlugin extends Plugin {
    settings: StatusIconPluginSettings;
    private updateQueue: Set<TFile> = new Set();

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new StatusIconSettingTab(this.app, this));
        
        console.log("Status Icon Plugin loaded");
    
        this.registerEvent(
            this.app.vault.on("modify", (file: TAbstractFile) => {
                if (file instanceof TFile) {
                    console.log("File modified:", file.path);
                    this.scheduleUpdate(file);
                }
            })
        );
    
        this.registerEvent(
            this.app.metadataCache.on("changed", (file: TFile) => {
                console.log("Metadata changed:", file.path);
                this.scheduleUpdate(file);
            })
        );
    
        this.app.workspace.onLayoutReady(() => {
            this.app.vault.getMarkdownFiles().forEach(file => {
                this.scheduleUpdate(file);
            });
    
            this.registerEvent(
                this.app.metadataCache.on("resolved", () => {
                    console.log("Metadata resolved, processing files");
                    this.app.vault.getMarkdownFiles().forEach(file => {
                        this.scheduleUpdate(file);
                    });
                })
            );
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.refreshAllFiles();
    }

    private refreshAllFiles() {
        this.app.vault.getMarkdownFiles().forEach(file => {
            this.updateStatusIcons(file).catch(error =>
                console.error("Status update failed:", error)
            );
        });
    }

    private scheduleUpdate(file: TFile) {
        this.updateQueue.add(file);
        setTimeout(() => {
            this.processQueue();
            this.updateQueue.clear();
        }, 300);
    }

    private processQueue() {
        this.updateQueue.forEach(file => {
            this.updateStatusIcons(file).catch(error =>
                console.error("Status update failed:", error)
            );
        });
    }

    private async updateStatusIcons(file: TFile) {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const rawStatus = frontmatter?.status;

        const normalizeStatus = (input: any): string[] => {
            if (!input) return [];

            if (typeof input === 'string') {
                return input
                    .replace(/[[\]"]/g, '')
                    .split(',')
                    .map(s => s.trim())
                    .filter(s => s);
            }

            if (Array.isArray(input)) {
                return input
                    .map(item => String(item).replace(/[[\]"]/g, '').trim())
                    .filter(s => s);
            }

            return [];
        };

        const statuses = normalizeStatus(rawStatus);

        let retries = 0;
        const tryUpdate = () => {
            const titleEl = document.querySelector(
                `div[data-path="${file.path}"] .tree-item-inner.nav-file-title-content`
            ) as HTMLElement;

            if (titleEl) {
                titleEl.classList.remove("has-status");
                titleEl.classList.forEach(cls => {
                    if (cls.startsWith("status-")) titleEl.classList.remove(cls);
                });

                if (statuses.length > 0) {
                    statuses.forEach((s: string) => {
                        const cleanStatus = s.replace(" ", "-");
                        titleEl.classList.add(`status-${cleanStatus}`);
                    });
                    titleEl.classList.add("has-status");

                    const emojis = statuses
                        .map((s: string) => {
                            const mapping = this.settings.statusMappings[s];
                            return mapping && mapping.enabled ? mapping.emoji : "";
                        })
                        .filter((e: string) => e)
                        .join(" ");

                    if (!titleEl.dataset.originalText) {
                        titleEl.dataset.originalText = titleEl.textContent || "";
                    }

                    titleEl.textContent = `${emojis} ${titleEl.dataset.originalText}`;
                } else {
                    if (titleEl.dataset.originalText) {
                        titleEl.textContent = titleEl.dataset.originalText;
                    }
                }
            } else if (retries < 3) {
                retries++;
                setTimeout(tryUpdate, 100 * retries);
            }
        };

        tryUpdate();
    }
}

class StatusIconSettingTab extends PluginSettingTab {
    plugin: StatusIconPlugin;
    private newStatusName: string = '';
    private textInput: any;

    constructor(app: App, plugin: StatusIconPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Status Icon Settings' });

        // Add Reset Settings button at the top
        new Setting(containerEl)
            .setName('Reset Settings')
            .setDesc('Restore all default status mappings')
            .addButton(button => button
                .setButtonText('Reset to Defaults')
                .onClick(async () => {
                    this.plugin.settings.statusMappings = Object.assign({}, DEFAULT_SETTINGS.statusMappings);
                    await this.plugin.saveSettings();
                    this.display();
                }));

        Object.entries(this.plugin.settings.statusMappings).forEach(([status, mapping]) => {
            new Setting(containerEl)
                .setName(status)
                .setDesc('Configure emoji and toggle status')
                .addText(text => text
                    .setPlaceholder('Enter emoji')
                    .setValue(mapping.emoji)
                    .onChange(async (value) => {
                        this.plugin.settings.statusMappings[status].emoji = value;
                        await this.plugin.saveSettings();
                    }))
                .addToggle(toggle => toggle
                    .setValue(mapping.enabled)
                    .onChange(async (value) => {
                        this.plugin.settings.statusMappings[status].enabled = value;
                        await this.plugin.saveSettings();
                    }));
        });
        // Add New Status section
        const newStatusContainer = containerEl.createEl('div', { cls: 'status-add-container' });
        
        new Setting(newStatusContainer)
            .setName('Add New Status')
            .setDesc('Add a new status-emoji mapping')
            .addText(text => {
                this.textInput = text;
                return text
                    .setPlaceholder('Status name')
                    .setValue('')
                    .onChange((value) => {
                        this.newStatusName = value;
                    });
            })
            .addButton(button => button
                .setButtonText('Confirm')
                .setCta() // This makes the button more prominent
                .onClick(async () => {
                    await this.addNewStatus();
                }));

        // Add Enter key handler
        this.textInput.inputEl.addEventListener('keydown', async (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                await this.addNewStatus();
            }
        });
    }

    private async addNewStatus(): Promise<void> {
        if (this.newStatusName && !this.plugin.settings.statusMappings[this.newStatusName]) {
            this.plugin.settings.statusMappings[this.newStatusName] = {
                emoji: '📌',
                enabled: true
            };
            await this.plugin.saveSettings();
            this.newStatusName = '';
            this.textInput.setValue('');
            this.display();
        }
    }
}