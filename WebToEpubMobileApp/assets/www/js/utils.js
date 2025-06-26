/**
 * Utility functions for WebToEpub web application
 */

class Utils {
    /**
     * Sanitize HTML content
     */
    static sanitizeHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;

        // Remove script tags
        const scripts = div.querySelectorAll('script');
        scripts.forEach(script => script.remove());

        // Remove style tags
        const styles = div.querySelectorAll('style');
        styles.forEach(style => style.remove());

        // Remove comments
        const walker = document.createTreeWalker(
            div,
            NodeFilter.SHOW_COMMENT,
            null,
            false
        );

        const comments = [];
        let node;
        while (node = walker.nextNode()) {
            comments.push(node);
        }
        comments.forEach(comment => comment.remove());

        return div.innerHTML;
    }

    /**
     * Clean text content
     */
    static cleanText(text) {
        if (!text) return '';

        return text
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .replace(/\n\s*\n/g, '\n') // Replace multiple newlines with single newline
            .trim();
    }

    /**
     * Extract text content from HTML
     */
    static extractText(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return this.cleanText(div.textContent || div.innerText || '');
    }

    /**
     * Generate a safe filename
     */
    static sanitizeFilename(filename) {
        return filename
            .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .replace(/_{2,}/g, '_') // Replace multiple underscores with single
            .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
    }

    /**
     * Format file size
     */
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }



    /**
     * Show error message
     */
    static showError(message, duration = 0) {
        const errorSection = document.getElementById('errorSection');
        const errorText = document.getElementById('errorText');

        if (errorSection && errorText) {
            // Replace newlines with HTML line breaks
            const formattedMessage = message.replace(/\n/g, '<br>');
            errorText.innerHTML = formattedMessage;
            errorSection.style.display = 'flex';

            // If duration is specified, hide the error after that time
            if (duration > 0) {
                setTimeout(() => {
                    this.hideError();
                }, duration);
            }
        }
    }

    /**
     * Hide error message
     */
    static hideError() {
        const errorSection = document.getElementById('errorSection');
        if (errorSection) {
            errorSection.style.display = 'none';
        }
    }

    /**
     * Show success message
     */
    static showSuccess(message) {
        // First hide any existing error
        this.hideError();

        const successSection = document.getElementById('successSection');
        const successText = document.getElementById('successText');

        if (!successSection) {
            // Create success section if it doesn't exist
            const section = document.createElement('div');
            section.id = 'successSection';
            section.className = 'alert alert-success';
            section.style.display = 'none';
            section.innerHTML = `
                <span id="successText"></span>
                <button type="button" class="close" onclick="Utils.hideSuccess()">×</button>
            `;
            document.querySelector('main').insertBefore(section, document.getElementById('errorSection'));
        }

        const section = document.getElementById('successSection');
        const text = document.getElementById('successText');

        if (text) {
            text.textContent = message;
        }

        if (section) {
            section.style.display = 'block';
            // Auto-hide after 3 seconds
            setTimeout(() => this.hideSuccess(), 3000);
        }
    }

    /**
     * Hide success message
     */
    static hideSuccess() {
        const successSection = document.getElementById('successSection');
        if (successSection) {
            successSection.style.display = 'none';
        }
    }

    /**
     * Update progress bar
     */
    static updateProgress(percentage, message) {
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');

        if (progressContainer && progressBar && progressText) {
            progressContainer.style.display = 'flex';
            progressBar.style.width = `${percentage}%`;
            progressText.textContent = message || `${Math.round(percentage)}%`;
        }

        // Log progress to console for debugging
        console.log('Progress:', message, `${Math.round(percentage)}%`);
    }

    /**
     * Hide progress bar
     */
    static hideProgress() {
        const progressContainer = document.getElementById('progressContainer');
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
    }

    /**
     * Download file
     */
    static downloadFile(content, filename, mimeType = 'application/octet-stream') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
    }

    /**
     * Get domain from URL
     */
    static getDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (e) {
            return '';
        }
    }

    /**
     * Check if URL is valid
     */
    static isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Debounce function
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Throttle function
     */
    static throttle(func, limit) {
        let inThrottle;
        return function () {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Generate UUID
     */
    static generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Sleep function
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Retry function with exponential backoff
     */
    static async retry(fn, maxAttempts = 3, baseDelay = 1000) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === maxAttempts) {
                    throw error;
                }

                const delay = baseDelay * Math.pow(2, attempt - 1);
                await this.sleep(delay);
            }
        }
    }

    /**
     * Parse HTML string into DOM
     */
    static parseHTML(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Check for parsing errors
        const parserError = doc.querySelector('parsererror');
        if (parserError) {
            console.error('HTML parsing error:', parserError);
            throw new Error('Failed to parse HTML content');
        }

        return doc;
    }

    /**
     * Escape HTML entities
     */
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Unescape HTML entities
     */
    static unescapeHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }
}

// Export for use in other modules
window.Utils = Utils;
