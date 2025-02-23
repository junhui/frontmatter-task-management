import { Plugin, TFile, TAbstractFile } from "obsidian";

const STATUS_EMOJI_MAP: { [key: string]: string } = {
	"todo": "📋",
	"to-do": "📋",
	"incomplete": "🟡",
	"done": "✅",
	"canceled": "❌",
	"forwarded": "➡️",
	"scheduling": "📅",
	"question": "❓",
	"important": "⚠️",
	"star": "⭐",
	"quote": "💬",
	"location": "📍",
	"bookmark": "🔖",
	"information": "ℹ️",
	"savings": "💰",
	"idea": "💡",
	"pros": "👍",
	"cons": "👎",
	"fire": "🔥",
	"key": "🔑",
	"win": "🏆",
	"up": "⬆️",
	"down": "⬇️"
};

export default class StatusIconPlugin extends Plugin {
	private updateQueue: Set<TFile> = new Set();

	async onload() {
		console.log("Status Icon Plugin loaded");
	
		// File modification listener
		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) => {
				if (file instanceof TFile) {
					console.log("File modified:", file.path);
					this.scheduleUpdate(file);
				}
			})
		);
	
		// Metadata change listener
		this.registerEvent(
			this.app.metadataCache.on("changed", (file: TFile) => {
				console.log("Metadata changed:", file.path);
				this.scheduleUpdate(file);
			})
		);
	
		// Initial processing after startup
		this.app.workspace.onLayoutReady(() => {
			// Process all files immediately when layout is ready
			this.app.vault.getMarkdownFiles().forEach(file => {
				this.scheduleUpdate(file);
			});
	
			// Also set up metadata resolution listener for any late-loading files
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

		// Normalize different status formats
		const normalizeStatus = (input: any): string[] => {
			if (!input) return [];

			// Handle string formats
			if (typeof input === 'string') {
				// Remove square brackets and quotes, then split by comma
				return input
					.replace(/[[\]"]/g, '') // Remove [ ] and "
					.split(',')             // Split comma-separated
					.map(s => s.trim())     // Trim whitespace
					.filter(s => s);        // Remove empty
			}

			// Handle array formats (both YAML list and [a,b] syntax)
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
				// Clear previous state
				titleEl.classList.remove("has-status");
				titleEl.classList.forEach(cls => {
					if (cls.startsWith("status-")) titleEl.classList.remove(cls);
				});

				if (statuses.length > 0) {
					// Add CSS classes
					statuses.forEach((s: string) => {
						const cleanStatus = s.replace(" ", "-");
						titleEl.classList.add(`status-${cleanStatus}`);
					});
					titleEl.classList.add("has-status");

					// Generate emojis
					const emojis = statuses
						.map((s: string) => STATUS_EMOJI_MAP[s] || "")
						.filter((e: string) => e)
						.join(" ");

					// Preserve original text
					if (!titleEl.dataset.originalText) {
						titleEl.dataset.originalText = titleEl.textContent || "";
					}

					// Update display text
					titleEl.textContent = `${emojis} ${titleEl.dataset.originalText}`;
				} else {
					// Clear emojis if no status
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