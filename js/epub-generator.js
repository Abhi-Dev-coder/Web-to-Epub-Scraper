/**
 * EPUB Generator module for WebToEpub web application
 * Creates EPUB files from parsed content
 */

class EpubGenerator {
    constructor() {
        this.zip = new JSZip();
    }

    /**
     * Generate EPUB from chapters and metadata
     */
    async generateEpub(metaInfo, chapters, onProgress) {
        try {
            if (!chapters || !Array.isArray(chapters)) {
                throw new Error('Invalid chapters data: chapters must be an array');
            }

            if (chapters.length === 0) {
                throw new Error('No chapters to generate EPUB from');
            }

            onProgress(0, 'Creating EPUB structure...');

            // Create EPUB structure
            this.createEpubStructure();

            // Add metadata
            onProgress(20, 'Adding metadata...');
            this.addMetadata(metaInfo, chapters);

            // Add chapters
            onProgress(30, 'Adding chapters...');
            await this.addChapters(chapters, onProgress);

            // Add cover image if available
            if (metaInfo.coverImageUrl) {
                onProgress(90, 'Adding cover image...');
                await this.addCoverImage(metaInfo.coverImageUrl);
            }

            // Generate EPUB file
            onProgress(95, 'Generating final EPUB file...');
            const epubBlob = await this.zip.generateAsync({
                type: 'blob',
                mimeType: 'application/epub+zip'
            });

            onProgress(100, 'EPUB generation complete');
            return epubBlob;

        } catch (error) {
            throw new Error(`Failed to generate EPUB: ${error.message}`);
        }
    }

    /**
     * Create basic EPUB structure
     */
    createEpubStructure() {
        // Create META-INF directory
        this.zip.folder('META-INF');

        // Create OEBPS directory (OEBPS = Open eBook Publication Structure)
        this.zip.folder('OEBPS');

        // Add container.xml
        const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`;

        this.zip.file('META-INF/container.xml', containerXml);
    }

    /**
     * Add metadata to EPUB
     */
    addMetadata(metaInfo, chapters) {
        const now = new Date().toISOString();
        const identifier = Utils.generateUUID();

        // Create content.opf
        const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <dc:identifier id="BookId">urn:uuid:${identifier}</dc:identifier>
        <dc:title>${this.escapeXml(metaInfo.title)}</dc:title>
        <dc:creator>${this.escapeXml(metaInfo.author)}</dc:creator>
        <dc:language>${metaInfo.language}</dc:language>
        <dc:date>${now}</dc:date>
        <dc:publisher>WebToEpub</dc:publisher>
        <dc:description>${this.escapeXml(metaInfo.description)}</dc:description>
        <dc:subject>${this.escapeXml(metaInfo.subject)}</dc:subject>
        <meta property="dcterms:modified">${now}</meta>
        ${metaInfo.coverImageUrl ? '<meta name="cover" content="cover-image"/>' : ''}
    </metadata>
    <manifest>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        <item id="css" href="style.css" media-type="text/css"/>
        ${metaInfo.coverImageUrl ? '<item id="cover-image" href="cover.jpg" media-type="image/jpeg"/>' : ''}
        ${chapters.map((chapter, index) =>
            `<item id="chapter-${index + 1}" href="chapter-${index + 1}.xhtml" media-type="application/xhtml+xml"/>`
        ).join('\n        ')}
    </manifest>
    <spine toc="ncx">
        ${chapters.map((chapter, index) =>
            `<itemref idref="chapter-${index + 1}"/>`
        ).join('\n        ')}
    </spine>
</package>`;

        this.zip.file('OEBPS/content.opf', contentOpf);

        // Create toc.ncx
        const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="en">
    <head>
        <meta name="dtb:uid" content="${identifier}"/>
        <meta name="dtb:depth" content="1"/>
        <meta name="dtb:totalPageCount" content="0"/>
        <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle>
        <text>${this.escapeXml(metaInfo.title)}</text>
    </docTitle>
    <navMap>
        ${chapters.map((chapter, index) => `
        <navPoint id="nav-${index + 1}" playOrder="${index + 1}">
            <navLabel>
                <text>${this.escapeXml(chapter.title)}</text>
            </navLabel>
            <content src="chapter-${index + 1}.xhtml"/>
        </navPoint>`).join('\n        ')}
    </navMap>
</ncx>`;

        this.zip.file('OEBPS/toc.ncx', tocNcx);

        // Create CSS
        const css = `body {
    font-family: Georgia, serif;
    line-height: 1.6;
    margin: 2em;
    text-align: justify;
}

h1, h2, h3 {
    color: #333;
    margin-top: 2em;
    margin-bottom: 1em;
}

h1 {
    font-size: 1.8em;
    text-align: center;
    border-bottom: 2px solid #333;
    padding-bottom: 0.5em;
}

h2 {
    font-size: 1.4em;
}

p {
    margin-bottom: 1em;
    text-indent: 2em;
}

img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1em auto;
}

blockquote {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid #ccc;
    background: #f9f9f9;
}

hr {
    border: none;
    border-top: 1px solid #ccc;
    margin: 2em 0;
}`;

        this.zip.file('OEBPS/style.css', css);
    }

    /**
     * Add chapters to EPUB
     */
    async addChapters(chapters, onProgress) {
        for (let i = 0; i < chapters.length; i++) {
            const chapter = chapters[i];
            const chapterNumber = i + 1;
            const progress = 30 + ((i / chapters.length) * 60); // Progress from 30% to 90%

            onProgress(
                progress,
                `Processing chapter ${chapterNumber} of ${chapters.length}`
            );

            // Create XHTML chapter
            const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>${this.escapeXml(chapter.title)}</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
    <h1>${this.escapeXml(chapter.title)}</h1>
    ${this.processChapterContent(chapter.content)}
</body>
</html>`;

            this.zip.file(`OEBPS/chapter-${chapterNumber}.xhtml`, chapterXhtml);

            // Add small delay to prevent overwhelming the system
            await Utils.sleep(100);
        }
    }

    /**
     * Process chapter content for EPUB
     */
    processChapterContent(content) {
        if (!content) return '<p>No content available.</p>';

        // Parse the HTML content
        const div = document.createElement('div');
        div.innerHTML = content;

        // Remove unwanted elements
        const unwantedSelectors = [
            'script', 'style', 'iframe', 'form', 'button', 'input',
            '.advertisement', '.ads', '.social-share', '.comments',
            '[id*="google"]', '[class*="google"]',
            '[id*="ad-"]', '[class*="ad-"]',
            '[id*="share"]', '[class*="share"]'
        ];

        unwantedSelectors.forEach(selector => {
            div.querySelectorAll(selector).forEach(el => el.remove());
        });

        // Process all text nodes to clean up whitespace
        const walker = document.createTreeWalker(
            div,
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

        // Wrap plain text in paragraphs
        const elements = Array.from(div.childNodes);
        elements.forEach(element => {
            if (element.nodeType === Node.TEXT_NODE && element.textContent.trim()) {
                const p = document.createElement('p');
                p.textContent = element.textContent.trim();
                element.parentNode.replaceChild(p, element);
            }
        });

        // Convert relative URLs to absolute
        div.querySelectorAll('img').forEach(img => {
            if (img.src) {
                try {
                    img.src = new URL(img.src, window.location.href).href;
                } catch (e) {
                    // Remove image if URL is invalid
                    img.remove();
                }
            }
        });

        // Convert div elements to paragraphs if they only contain text
        div.querySelectorAll('div').forEach(divEl => {
            if (!divEl.querySelector('div, p, img, table')) {
                const p = document.createElement('p');
                p.innerHTML = divEl.innerHTML;
                divEl.parentNode.replaceChild(p, divEl);
            }
        });

        // Ensure proper XHTML structure
        let processedContent = div.innerHTML
            .replace(/<br\s*\/?>/gi, '<br/>')
            .replace(/<hr\s*\/?>/gi, '<hr/>')
            .replace(/<img([^>]*)\s*\/?>/gi, '<img$1/>')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Split content into paragraphs if it's one large block
        if (!processedContent.includes('<p>') && !processedContent.includes('<div>')) {
            processedContent = processedContent
                .split(/\n\s*\n/)
                .map(para => para.trim())
                .filter(para => para)
                .map(para => `<p>${para}</p>`)
                .join('\n');
        }

        return processedContent;
    }

    /**
     * Ensure proper XHTML structure
     */
    ensureProperXhtml(content) {
        // List of self-closing tags
        const selfClosingTags = ['br', 'hr', 'img', 'input', 'link', 'meta'];

        // Ensure proper closing for self-closing tags
        selfClosingTags.forEach(tag => {
            const regex = new RegExp(`<${tag}([^>]*)>`, 'gi');
            content = content.replace(regex, `<${tag}$1/>`);
        });

        // Clean up any remaining HTML entities
        content = content
            .replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        return content;
    }

    /**
     * Add cover image to EPUB
     */
    async addCoverImage(imageUrl) {
        try {
            Utils.updateProgress(0, 'Downloading cover image...');

            // Use CORS proxy for cover image
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(imageUrl)}`;
            const response = await fetch(proxyUrl);

            if (!response.ok) {
                console.warn('Failed to download cover image');
                return;
            }

            const data = await response.json();
            const imageContent = data.contents;

            if (imageContent) {
                // Convert base64 to blob
                const binaryString = atob(imageContent);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                const imageBlob = new Blob([bytes], { type: 'image/jpeg' });
                this.zip.file('OEBPS/cover.jpg', imageBlob);

                Utils.updateProgress(100, 'Cover image added');
            }

        } catch (error) {
            console.warn('Error adding cover image:', error);
        }
    }

    /**
     * Escape XML special characters
     */
    escapeXml(text) {
        if (!text) return '';

        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Generate filename for EPUB
     */
    generateFilename(metaInfo) {
        let filename = metaInfo.title || 'untitled';
        filename = Utils.sanitizeFilename(filename);

        // Add author if available
        if (metaInfo.author) {
            const author = Utils.sanitizeFilename(metaInfo.author);
            filename = `${filename}_by_${author}`;
        }

        return `${filename}.epub`;
    }
}

// Export for use in other modules
window.EpubGenerator = EpubGenerator; 