/**
 * Parser module for WebToEpub web application
 * Handles web page parsing and content extraction
 */

class Parser {
    constructor() {
        this.chapters = [];
        this.metaInfo = {
            title: '',
            author: '',
            language: 'en',
            description: '',
            subject: '',
            coverImageUrl: ''
        };
        this.siteSpecificRules = {
            'wuxiaworld.com': {
                titleSelector: '.novel-title',
                authorSelector: '.author',
                chapterSelectors: ['.chapter-item a', '.wp-manga-chapter a'],
                contentSelector: '.chapter-content'
            },
            'royalroad.com': {
                titleSelector: '.fic-title h1',
                authorSelector: '.author-name',
                chapterSelectors: ['.chapter-row a'],
                contentSelector: '.chapter-content'
            },
            'novelupdates.com': {
                titleSelector: '.seriestitlenu',
                authorSelector: '#showauthors',
                chapterSelectors: ['#chapterlist a'],
                contentSelector: '.chapter-content'
            }
            // Add more sites as needed
        };
    }

    /**
     * Parse a web page and extract content
     */
    async parsePage(url) {
        try {
            console.log('Fetching page content...');

            // Try multiple CORS proxies in case one fails
            const proxyUrls = [
                `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
                `https://cors-anywhere.herokuapp.com/${url}`,
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
                `https://corsproxy.io/?${encodeURIComponent(url)}`,
                `https://thingproxy.freeboard.io/fetch/${url}`,
                `https://yacdn.org/proxy/${url}`
            ];

            let html = null;
            let error = null;

            // Try each proxy until one works
            for (const proxyUrl of proxyUrls) {
                try {
                    Utils.updateProgress(0, 'Fetching page content...');
                    const response = await fetch(proxyUrl);
                    if (response.ok) {
                        if (proxyUrl.includes('allorigins')) {
                            const data = await response.json();
                            html = data.contents;
                        } else {
                            html = await response.text();
                        }
                        if (html) break;
                    }
                } catch (e) {
                    error = e;
                    continue;
                }
            }

            if (!html) {
                console.error('All proxies failed:', error);
                throw new Error('Failed to fetch content. Please try again later or use a different URL.');
            }

            Utils.updateProgress(30, 'Analyzing page structure...');
            const dom = Utils.parseHTML(html);

            // Get hostname for site-specific rules
            const hostname = new URL(url).hostname.replace('www.', '');
            const siteRules = this.siteSpecificRules[hostname] || this.getDefaultRules();

            // Extract metadata using site-specific rules if available
            Utils.updateProgress(50, 'Extracting metadata...');
            this.extractMetadata(dom, url, siteRules);

            // Extract chapters
            Utils.updateProgress(70, 'Finding chapters...');
            await this.extractChapters(dom, url, siteRules);

            Utils.updateProgress(100, 'Page analysis complete');
            setTimeout(() => Utils.hideProgress(), 1000);

            return {
                metaInfo: this.metaInfo,
                chapters: this.chapters
            };

        } catch (error) {
            Utils.hideProgress();
            console.error('Parser error:', error);
            throw new Error(`Parser failed: ${error.message}. Please try a different URL or contact support.`);
        }
    }

    /**
     * Get default parsing rules
     */
    getDefaultRules() {
        return {
            titleSelector: [
                'h1',
                '.title',
                '.novel-title',
                '.story-title',
                '[property="og:title"]',
                'title'
            ].join(','),
            authorSelector: [
                '.author',
                '.novel-author',
                '.story-author',
                '[property="article:author"]',
                'a[href*="author"]'
            ].join(','),
            chapterSelectors: [
                '.chapter-list a',
                '.chapters a',
                'a[href*="chapter"]',
                '.chapter-link',
                '.novel-chapter a',
                '.story-chapter a'
            ],
            contentSelector: [
                '.chapter-content',
                '.entry-content',
                'article',
                '.post-content',
                '.content'
            ].join(',')
        };
    }

    /**
     * Extract metadata from the page
     */
    extractMetadata(dom, url, siteRules) {
        // Try site-specific selector first, then fall back to defaults
        const titleElement = dom.querySelector(siteRules.titleSelector) ||
            dom.querySelector(this.getDefaultRules().titleSelector);

        if (titleElement) {
            this.metaInfo.title = Utils.cleanText(titleElement.textContent || titleElement.getAttribute('content') || '');
        }

        const authorElement = dom.querySelector(siteRules.authorSelector) ||
            dom.querySelector(this.getDefaultRules().authorSelector);

        if (authorElement) {
            this.metaInfo.author = Utils.cleanText(authorElement.textContent || '');
        }

        // Try to extract description
        const descSelectors = [
            '[property="og:description"]',
            '.description',
            '.summary',
            '.synopsis'
        ];

        for (const selector of descSelectors) {
            const element = dom.querySelector(selector);
            if (element) {
                this.metaInfo.description = Utils.cleanText(element.textContent || element.getAttribute('content') || '');
                break;
            }
        }

        // Try to extract cover image
        const coverSelectors = [
            '[property="og:image"]',
            '.cover img',
            '.novel-cover img',
            '.story-cover img'
        ];

        for (const selector of coverSelectors) {
            const element = dom.querySelector(selector);
            if (element) {
                const src = element.getAttribute('src') || element.getAttribute('content');
                if (src) {
                    this.metaInfo.coverImageUrl = this.resolveUrl(src, url);
                    break;
                }
            }
        }

        // Generate filename if not set
        if (!this.metaInfo.title) {
            this.metaInfo.title = 'Untitled Story';
        }
    }

    /**
     * Extract chapters from the page with improved error handling
     */
    async extractChapters(dom, baseUrl, siteRules) {
        this.chapters = [];
        let allChapterLinks = [];
        let processedUrls = new Set();

        console.log('Extracting chapters with rules:', siteRules);

        // Try site-specific selectors first
        if (Array.isArray(siteRules.chapterSelectors)) {
            for (const selector of siteRules.chapterSelectors) {
                console.log('Trying selector:', selector);
                const links = dom.querySelectorAll(selector);
                if (links.length > 0) {
                    console.log(`Found ${links.length} links with selector:`, selector);
                    allChapterLinks = Array.from(links);
                    break;
                }
            }
        }

        // If no chapters found, try default selectors
        if (allChapterLinks.length === 0) {
            const defaultSelectors = this.getDefaultRules().chapterSelectors;
            console.log('Trying default selectors:', defaultSelectors);

            for (const selector of defaultSelectors) {
                const links = dom.querySelectorAll(selector);
                if (links.length > 0) {
                    console.log(`Found ${links.length} links with default selector:`, selector);
                    allChapterLinks = Array.from(links);
                    break;
                }
            }
        }

        // If still no chapters found, try a more aggressive approach
        if (allChapterLinks.length === 0) {
            console.log('No chapters found with standard selectors, trying aggressive approach');
            const allLinks = dom.querySelectorAll('a[href]');
            allChapterLinks = Array.from(allLinks).filter(link => {
                const href = link.getAttribute('href');
                const text = link.textContent.toLowerCase();
                return href && (
                    text.includes('chapter') ||
                    text.includes('ch.') ||
                    text.match(/ch\s*\d+/i) ||
                    text.match(/chapter\s*\d+/i) ||
                    href.includes('chapter') ||
                    href.match(/ch\d+/i) ||
                    href.match(/chapter-\d+/i)
                );
            });
            console.log(`Found ${allChapterLinks.length} potential chapter links with aggressive approach`);
        }

        if (allChapterLinks.length === 0) {
            throw new Error('No chapters found on the page');
        }

        // Process chapter links
        console.log('Processing chapter links...');
        allChapterLinks.forEach((link, index) => {
            const href = link.getAttribute('href');
            if (!href) return;

            // Resolve relative URLs to absolute
            const absoluteUrl = this.resolveUrl(href, baseUrl);
            if (processedUrls.has(absoluteUrl)) return;
            processedUrls.add(absoluteUrl);

            const title = Utils.cleanText(link.textContent) || `Chapter ${index + 1}`;

            this.chapters.push({
                url: absoluteUrl,
                baseUrl: baseUrl,  // Store base URL for later use
                title: title,
                index: index,
                selected: true,
                status: 'pending',
                content: null,
                error: null
            });
        });

        // Sort chapters by their numeric order if possible
        this.chapters.sort((a, b) => {
            const aMatch = a.title.match(/\d+/);
            const bMatch = b.title.match(/\d+/);
            if (aMatch && bMatch) {
                return parseInt(aMatch[0]) - parseInt(bMatch[0]);
            }
            return a.index - b.index;
        });

        console.log(`Extracted ${this.chapters.length} chapters`);
    }

    /**
     * Fetch and extract content for a single chapter
     */
    async fetchChapterContent(chapter, index) {
        const maxRetries = 3;
        let retryCount = 0;

        while (retryCount < maxRetries) {
            try {
                console.log(`Fetching chapter ${index + 1}:`, chapter.url);

                // Ensure URL is absolute
                const absoluteUrl = this.resolveUrl(chapter.url, chapter.baseUrl || '');
                console.log('Absolute URL:', absoluteUrl);

                // Try multiple CORS proxies
                const proxyUrls = [
                    `https://api.allorigins.win/get?url=${encodeURIComponent(absoluteUrl)}`,
                    `https://corsproxy.io/?${encodeURIComponent(absoluteUrl)}`,
                    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(absoluteUrl)}`,
                    `https://thingproxy.freeboard.io/fetch/${absoluteUrl}`,
                    `https://yacdn.org/proxy/${absoluteUrl}`
                ];

                let html = null;
                let lastError = null;

                for (const proxyUrl of proxyUrls) {
                    try {
                        console.log('Trying proxy:', proxyUrl);
                        const response = await fetch(proxyUrl);

                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }

                        if (proxyUrl.includes('allorigins')) {
                            const data = await response.json();
                            html = data.contents;
                        } else {
                            html = await response.text();
                        }

                        if (html && html.length > 0) {
                            console.log('Successfully fetched content with length:', html.length);
                            break;
                        }
                    } catch (e) {
                        console.error('Proxy error:', e);
                        lastError = e;
                        continue;
                    }
                }

                if (!html) {
                    throw new Error(lastError ? `Failed to fetch content: ${lastError.message}` : 'Failed to fetch content from all proxies');
                }

                const dom = Utils.parseHTML(html);

                // Get hostname for site-specific rules
                const hostname = new URL(absoluteUrl).hostname.replace('www.', '');
                const siteRules = this.siteSpecificRules[hostname] || this.getDefaultRules();

                // Try to find the content element
                let contentElement = null;

                // First try site-specific content selector
                if (siteRules.contentSelector) {
                    contentElement = dom.querySelector(siteRules.contentSelector);
                    console.log('Site-specific selector result:', !!contentElement);
                }

                // If not found, try default content selectors
                if (!contentElement) {
                    const defaultSelectors = this.getDefaultRules().contentSelector.split(',');
                    for (const selector of defaultSelectors) {
                        contentElement = dom.querySelector(selector.trim());
                        if (contentElement) {
                            console.log('Found content with selector:', selector);
                            break;
                        }
                    }
                }

                // If still not found, try to find the largest text block
                if (!contentElement) {
                    console.log('No content found with selectors, trying largest text block');
                    contentElement = this.findLargestTextBlock(dom);
                }

                if (!contentElement) {
                    throw new Error('Could not find chapter content');
                }

                // Clean the content
                this.removeUnwantedElements(contentElement);

                // Extract and clean the content
                const content = this.extractContent(contentElement);

                if (!content || content.trim().length < 100) {
                    throw new Error('Extracted content is too short or empty');
                }

                chapter.content = content;
                chapter.status = 'completed';
                this.updateChapterUI(index);

                // Add a small delay between requests to avoid overwhelming the server
                await Utils.sleep(1000);
                return;

            } catch (error) {
                console.error(`Error fetching chapter ${index + 1}:`, error);
                retryCount++;

                if (retryCount >= maxRetries) {
                    chapter.status = 'error';
                    chapter.error = error.message;
                    this.updateChapterUI(index);
                    throw error;
                }

                // Wait longer between retries
                await Utils.sleep(2000 * retryCount);
            }
        }
    }

    /**
     * Find the largest text block in the document
     * This is used as a fallback when no content selector matches
     */
    findLargestTextBlock(dom) {
        let maxLength = 0;
        let bestElement = null;

        // Elements that typically contain the main content
        const contentTags = ['article', 'div', 'section', 'main'];

        for (const tag of contentTags) {
            const elements = dom.getElementsByTagName(tag);
            for (const element of elements) {
                // Skip elements that are likely to be navigation, headers, footers, etc.
                if (this.isLikelyContent(element)) {
                    const text = element.textContent.trim();
                    if (text.length > maxLength) {
                        maxLength = text.length;
                        bestElement = element;
                    }
                }
            }
        }

        return bestElement;
    }

    /**
     * Check if an element is likely to be main content
     */
    isLikelyContent(element) {
        const className = element.className.toLowerCase();
        const id = element.id.toLowerCase();

        // Skip common non-content elements
        const skipPatterns = [
            'header', 'footer', 'sidebar', 'menu', 'nav', 'comment',
            'advertisement', 'breadcrumb', 'pagination', 'social'
        ];

        for (const pattern of skipPatterns) {
            if (className.includes(pattern) || id.includes(pattern)) {
                return false;
            }
        }

        // Check text density
        const text = element.textContent.trim();
        const html = element.innerHTML;
        const textDensity = text.length / html.length;

        // High text density is likely content
        return textDensity > 0.5;
    }

    /**
     * Extract content from an element
     */
    extractContent(element) {
        if (!element) return '';

        // Clone the element to avoid modifying the original
        const content = element.cloneNode(true);

        // Remove unwanted elements
        const unwantedSelectors = [
            'script', 'style', 'iframe', 'form', 'button', 'input',
            '.advertisement', '.ads', '.social-share', '.comments',
            '[id*="google"]', '[class*="google"]',
            '[id*="ad-"]', '[class*="ad-"]',
            '[id*="share"]', '[class*="share"]'
        ];

        unwantedSelectors.forEach(selector => {
            content.querySelectorAll(selector).forEach(el => el.remove());
        });

        // Clean up text nodes
        const walker = document.createTreeWalker(
            content,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            node.textContent = node.textContent
                .replace(/\s+/g, ' ')
                .trim();
        }

        // Convert divs to paragraphs where appropriate
        content.querySelectorAll('div').forEach(div => {
            if (!div.querySelector('div, p, img, table')) {
                const p = document.createElement('p');
                p.innerHTML = div.innerHTML;
                div.parentNode.replaceChild(p, div);
            }
        });

        // Ensure text blocks are wrapped in paragraphs
        const elements = Array.from(content.childNodes);
        elements.forEach(element => {
            if (element.nodeType === Node.TEXT_NODE && element.textContent.trim()) {
                const p = document.createElement('p');
                p.textContent = element.textContent.trim();
                element.parentNode.replaceChild(p, element);
            }
        });

        // Clean up empty elements
        content.querySelectorAll('*').forEach(el => {
            if (!el.textContent.trim() && !el.querySelector('img')) {
                el.remove();
            }
        });

        return content.innerHTML;
    }

    /**
     * Remove unwanted elements from content
     */
    removeUnwantedElements(element) {
        if (!element) return;

        // Remove unwanted elements
        const unwantedSelectors = [
            'script', 'style', 'iframe', 'form', 'button', 'input',
            '.advertisement', '.ads', '.social-share', '.comments',
            '[id*="google"]', '[class*="google"]',
            '[id*="ad-"]', '[class*="ad-"]',
            '[id*="share"]', '[class*="share"]',
            // Common novel site specific elements
            '.chapter-nav', '.chapter-navigation', '.prev-chapter', '.next-chapter',
            '.chapter-buttons', '.rating', '.comments-section', '.author-note',
            '[id*="comment"]', '[class*="comment"]'
        ];

        unwantedSelectors.forEach(selector => {
            element.querySelectorAll(selector).forEach(el => el.remove());
        });

        // Remove empty elements
        element.querySelectorAll('*').forEach(el => {
            if (!el.textContent.trim() && !el.querySelector('img')) {
                el.remove();
            }
        });
    }

    /**
     * Update chapter UI
     */
    updateChapterUI(index) {
        const chapter = this.chapters[index];
        const chapterElement = document.querySelector(`#chapter-${index}`);
        const statusElement = document.querySelector(`#chapter-${index}`).parentElement.querySelector('.chapter-status');

        if (chapterElement && statusElement) {
            // Update status class
            statusElement.className = `chapter-status ${chapter.status}`;

            // Update status text
            let statusText = chapter.status;
            if (chapter.status === 'error') {
                statusText = `Error: ${chapter.error || 'Unknown error'}`;
            }
            statusElement.textContent = statusText;

            // Update checkbox state
            if (chapter.status === 'error') {
                chapterElement.checked = false;
                chapterElement.disabled = true;
            } else {
                chapterElement.disabled = false;
            }
        }
    }

    /**
     * Update chapter count
     */
    updateChapterCount() {
        const totalCount = this.chapters.length;
        const completedCount = this.chapters.filter(ch => ch.status === 'completed').length;
        const errorCount = this.chapters.filter(ch => ch.status === 'error').length;

        Utils.updateProgress(
            (completedCount / totalCount) * 100,
            `Processed ${completedCount}/${totalCount} chapters (${errorCount} errors)`
        );
    }

    /**
     * Resolve relative URL to absolute URL
     */
    resolveUrl(href, baseUrl) {
        try {
            return new URL(href, baseUrl).href;
        } catch (e) {
            return href;
        }
    }

    /**
     * Get selected chapters
     */
    getSelectedChapters() {
        return this.chapters.filter(chapter => chapter.selected);
    }

    /**
     * Check if chapters are ready
     */
    areChaptersReady() {
        const selectedChapters = this.getSelectedChapters();
        return selectedChapters.length > 0 && selectedChapters.every(ch => ch.status === 'completed' || ch.status === 'error');
    }
}

// Export for use in other modules
window.Parser = Parser;
