/**
 * Main application file for WebToEpub web application
 * Handles user interactions and coordinates between modules
 */

class WebToEpubApp {
    constructor() {
        this.parser = new Parser();
        this.epubGenerator = new EpubGenerator();
        this.currentMetaInfo = {};
        this.currentChapters = [];

        this.initializeEventListeners();
    }

    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        // Load and analyze button
        const loadButton = document.getElementById('loadAndAnalyse');
        if (loadButton) {
            loadButton.addEventListener('click', () => this.handleLoadAndAnalyze());
        }

        // Pack EPUB button
        const packButton = document.getElementById('packEpub');
        if (packButton) {
            packButton.addEventListener('click', () => this.handlePackEpub());
        }

        // Clear cover button
        const clearCoverButton = document.getElementById('clearCover');
        if (clearCoverButton) {
            clearCoverButton.addEventListener('click', () => this.clearCoverImage());
        }

        // Toggle advanced options
        const toggleAdvancedButton = document.getElementById('toggleAdvanced');
        if (toggleAdvancedButton) {
            toggleAdvancedButton.addEventListener('click', () => this.toggleAdvancedOptions());
        }

        // Select all chapters
        const selectAllButton = document.getElementById('selectAllChapters');
        if (selectAllButton) {
            selectAllButton.addEventListener('click', () => this.selectAllChapters());
        }

        // Deselect all chapters
        const deselectAllButton = document.getElementById('deselectAllChapters');
        if (deselectAllButton) {
            deselectAllButton.addEventListener('click', () => this.deselectAllChapters());
        }

        // Error close button
        const errorCloseButton = document.getElementById('errorClose');
        if (errorCloseButton) {
            errorCloseButton.addEventListener('click', () => Utils.hideError());
        }

        // Cover image URL input
        const coverImageInput = document.getElementById('coverImageUrl');
        if (coverImageInput) {
            coverImageInput.addEventListener('input', Utils.debounce(() => this.handleCoverImageChange(), 500));
        }

        // Form inputs for metadata
        this.setupFormInputs();
    }

    /**
     * Setup form input event listeners
     */
    setupFormInputs() {
        const inputs = ['title', 'author', 'language', 'filename', 'subject', 'description'];

        inputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => this.updateMetaInfo());
            }
        });
    }

    /**
     * Handle load and analyze button click
     */
    async handleLoadAndAnalyze() {
        const urlInput = document.getElementById('startingUrl');
        const url = urlInput.value.trim();

        if (!url) {
            Utils.showError('Please enter a URL');
            return;
        }

        if (!Utils.isValidUrl(url)) {
            Utils.showError('Please enter a valid URL');
            return;
        }

        try {
            Utils.hideError();
            console.log('Starting to parse URL:', url);

            // Reset UI
            this.currentChapters = [];
            this.currentMetaInfo = {};
            this.updateChaptersSection([]);
            Utils.updateProgress(0, '');

            // Parse the page
            console.log('Calling parser.parsePage...');
            const result = await this.parser.parsePage(url);
            console.log('Parser result:', result);

            if (!result || (!result.metaInfo && !result.chapters)) {
                throw new Error('Parser returned invalid result');
            }

            if (!result.chapters || result.chapters.length === 0) {
                throw new Error('No chapters found. This might not be a supported novel page.');
            }

            // Update UI with results
            console.log('Updating UI with results...');
            this.updateUIWithResults(result);

            // Fetch chapter content
            console.log('Starting to fetch chapters...');
            await this.fetchAllChapters();

            console.log('All chapters fetched successfully');

        } catch (error) {
            console.error('Error parsing page:', error);

            // Provide more specific error messages
            let errorMessage = 'Failed to parse page: ';

            if (error.message.includes('Failed to fetch')) {
                errorMessage += 'Could not access the webpage. This might be due to:' +
                    '\n1. The website is blocking access' +
                    '\n2. The website requires authentication' +
                    '\n3. The CORS proxy is temporarily unavailable' +
                    '\nPlease try again later or try a different URL.';
            } else if (error.message.includes('No chapters found')) {
                errorMessage += 'Could not find any chapters. This might be because:' +
                    '\n1. The URL is not a novel page' +
                    '\n2. The website structure is not supported' +
                    '\n3. The URL points to a chapter list rather than the main novel page' +
                    '\nPlease make sure you are using the main novel page URL.';
            } else {
                errorMessage += error.message;
            }

            Utils.showError(errorMessage);
        }
    }

    /**
     * Update UI with parsing results
     */
    updateUIWithResults(result) {
        this.currentMetaInfo = result.metaInfo;
        this.currentChapters = result.chapters;

        // Update form fields
        this.updateFormFields(result.metaInfo);

        // Update chapters section
        this.updateChaptersSection(result.chapters);

        // Show chapters section
        const chaptersSection = document.getElementById('chaptersSection');
        if (chaptersSection) {
            chaptersSection.style.display = 'block';
        }
    }

    /**
     * Update form fields with metadata
     */
    updateFormFields(metaInfo) {
        const fields = {
            'title': metaInfo.title,
            'author': metaInfo.author,
            'language': metaInfo.language || 'en',
            'filename': Utils.sanitizeFilename(metaInfo.title || 'untitled'),
            'subject': metaInfo.subject,
            'description': metaInfo.description
        };

        Object.entries(fields).forEach(([fieldId, value]) => {
            const field = document.getElementById(fieldId);
            if (field && value) {
                field.value = value;
            }
        });

        // Update cover image if available
        if (metaInfo.coverImageUrl) {
            const coverInput = document.getElementById('coverImageUrl');
            if (coverInput) {
                coverInput.value = metaInfo.coverImageUrl;
                this.showCoverPreview(metaInfo.coverImageUrl);
            }
        }
    }

    /**
     * Update chapters section
     */
    updateChaptersSection(chapters) {
        const chaptersList = document.getElementById('chaptersList');
        if (!chaptersList) return;

        chaptersList.innerHTML = '';

        chapters.forEach((chapter, index) => {
            const chapterItem = document.createElement('div');
            chapterItem.className = 'chapter-item';

            chapterItem.innerHTML = `
                <input type="checkbox" id="chapter-${index}" checked>
                <label for="chapter-${index}" class="chapter-title">${Utils.escapeHtml(chapter.title)}</label>
                <span class="chapter-status ${chapter.status}">${chapter.status}</span>
            `;

            chaptersList.appendChild(chapterItem);
        });

        this.updateChapterCount();
    }

    /**
     * Helper function to convert Blob to Base64 Data URL
     */
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result); // result includes 'data:mime/type;base64,' prefix
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Fetch all chapter content
     */
    async fetchAllChapters() {
        const chapters = this.currentChapters;
        let successCount = 0;
        let errorCount = 0;

        console.log(`Starting to fetch ${chapters.length} chapters...`);

        for (let i = 0; i < chapters.length; i++) {
            try {
                const progress = ((i + 1) / chapters.length) * 100;
                Utils.updateProgress(progress, `Fetching chapter ${i + 1}/${chapters.length}`);
                console.log(`Fetching chapter ${i + 1}/${chapters.length}:`, chapters[i].url);
                await this.parser.fetchChapterContent(chapters[i], i);
                successCount++;
            } catch (error) {
                console.error(`Error fetching chapter ${i + 1}:`, error);
                errorCount++;
            }
        }

        // Update progress bar to show completion
        Utils.updateProgress(100, 'All chapters fetched');
        setTimeout(() => Utils.hideProgress(), 2000);

        if (errorCount > 0) {
            Utils.showError(`Finished with ${errorCount} errors. ${successCount} chapters were fetched successfully.`);
        } else {
            Utils.showSuccess(`Successfully fetched all ${successCount} chapters.`);
        }

        // Enable pack button if we have any successful chapters
        const packButton = document.getElementById('packEpub');
        if (packButton) {
            packButton.disabled = successCount === 0;
        }
    }

    /**
     * Handle pack EPUB button click
     */
    async handlePackEpub() {
        try {
            const selectedChapters = this.getSelectedChapters();
            if (selectedChapters.length === 0) {
                Utils.showError('Please select at least one chapter');
                return;
            }

            console.log('Starting EPUB generation...');
            Utils.updateProgress(0, 'Preparing EPUB...');

            // Get current metadata
            this.updateMetaInfo();

            // Generate EPUB
            const epubBlob = await this.epubGenerator.generateEpub(
                this.currentMetaInfo,
                selectedChapters,
                (progress, message) => {
                    Utils.updateProgress(progress, message);
                }
            );

            // Generate filename
            const filename = Utils.sanitizeFilename(this.currentMetaInfo.filename || 'untitled');
            const fullFilename = filename.endsWith('.epub') ? filename : `${filename}.epub`;

            // Download the file (original behavior)
            // Utils.downloadFile(epubBlob, fullFilename, 'application/epub+zip');

            // --- MODIFIED FOR REACT NATIVE ---
            if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                const base64Data = await this.blobToBase64(epubBlob);
                const message = {
                    type: 'epubGenerated',
                    filename: fullFilename,
                    data: base64Data, // This will be a data URL: "data:application/epub+zip;base64,..."
                    mimeType: 'application/epub+zip'
                };
                window.ReactNativeWebView.postMessage(JSON.stringify(message));
                // User will be prompted by React Native side to save/share
                Utils.showSuccess('EPUB generated! Follow prompts to save/share.');
                Utils.updateProgress(100, 'EPUB ready');
                setTimeout(() => Utils.hideProgress(), 2000);
            } else {
                // Fallback for standard web environment if ReactNativeWebView is not injected
                Utils.downloadFile(epubBlob, fullFilename, 'application/epub+zip');
                Utils.showSuccess('EPUB generated successfully! (Web download)');
                Utils.updateProgress(100, 'EPUB generation complete');
                setTimeout(() => Utils.hideProgress(), 2000);
            }
            // --- END MODIFICATION ---

        } catch (error) {
            console.error('Error generating EPUB:', error);
            Utils.showError('Failed to generate EPUB: ' + error.message);
            Utils.updateProgress(0, 'EPUB generation failed');
            setTimeout(() => Utils.hideProgress(), 2000);
        }
    }

    /**
     * Get selected chapters
     */
    getSelectedChapters() {
        const selectedChapters = [];

        this.currentChapters.forEach((chapter, index) => {
            const checkbox = document.getElementById(`chapter-${index}`);
            if (checkbox && checkbox.checked && chapter.status === 'completed') {
                selectedChapters.push(chapter);
            }
        });

        return selectedChapters;
    }

    /**
     * Update metadata from form fields
     */
    updateMetaInfo() {
        const fields = ['title', 'author', 'language', 'filename', 'subject', 'description'];

        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                this.currentMetaInfo[fieldId] = field.value.trim();
            }
        });

        // Get cover image URL
        const coverInput = document.getElementById('coverImageUrl');
        if (coverInput) {
            this.currentMetaInfo.coverImageUrl = coverInput.value.trim();
        }
    }

    /**
     * Handle cover image URL change
     */
    handleCoverImageChange() {
        const coverInput = document.getElementById('coverImageUrl');
        const url = coverInput.value.trim();

        if (url && Utils.isValidUrl(url)) {
            this.showCoverPreview(url);
        } else {
            this.hideCoverPreview();
        }
    }

    /**
     * Show cover preview
     */
    showCoverPreview(imageUrl) {
        const preview = document.getElementById('coverPreview');
        const previewImg = document.getElementById('coverPreviewImg');

        if (preview && previewImg) {
            previewImg.src = imageUrl;
            preview.style.display = 'block';
        }
    }

    /**
     * Hide cover preview
     */
    hideCoverPreview() {
        const preview = document.getElementById('coverPreview');
        if (preview) {
            preview.style.display = 'none';
        }
    }

    /**
     * Clear cover image
     */
    clearCoverImage() {
        const coverInput = document.getElementById('coverImageUrl');
        if (coverInput) {
            coverInput.value = '';
        }
        this.hideCoverPreview();
    }

    /**
     * Toggle advanced options
     */
    toggleAdvancedOptions() {
        const advancedOptions = document.getElementById('advancedOptions');
        if (advancedOptions) {
            const isHidden = advancedOptions.style.display === 'none';
            advancedOptions.style.display = isHidden ? 'block' : 'none';
        }
    }

    /**
     * Select all chapters
     */
    selectAllChapters() {
        this.currentChapters.forEach((chapter, index) => {
            const checkbox = document.getElementById(`chapter-${index}`);
            if (checkbox && chapter.status === 'completed') {
                checkbox.checked = true;
            }
        });
    }

    /**
     * Deselect all chapters
     */
    deselectAllChapters() {
        this.currentChapters.forEach((chapter, index) => {
            const checkbox = document.getElementById(`chapter-${index}`);
            if (checkbox) {
                checkbox.checked = false;
            }
        });
    }

    /**
     * Update chapter count
     */
    updateChapterCount() {
        const completedCount = this.currentChapters.filter(ch => ch.status === 'completed').length;
        const totalCount = this.currentChapters.length;
        const countElement = document.getElementById('chapterCount');

        if (countElement) {
            countElement.textContent = `${completedCount} of ${totalCount} chapters ready`;
        }
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WebToEpubApp();
});
