import { Tags } from '../Tags';
import icon from './J-NovelClub.webp';
import { Chapter, DecoratableMangaScraper, Manga, type MangaPlugin, Page } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';
import { FetchHTML, FetchCSS } from '../platform/FetchProvider';
import { type Priority } from '../taskpool/TaskPool';

@Common.MangaCSS(/^{origin}\/series\/[^/]+$/, 'h1')
@Common.ChaptersSinglePageCSS('div.f12k8ro3 a.f122npxj.f1ppn23n:not(.unavailable)', Common.AnchorInfoExtractor(false))
export default class extends DecoratableMangaScraper {

    private authToken: string | null = null;
    private tokenExpiry: number = 0;

    constructor() {
        super('jnovelclub', 'J-Novel Club', 'https://j-novel.club', Tags.Media.Manga, Tags.Language.English, Tags.Source.Official);
        
        // Try to authenticate on initialization if credentials are available
        this.initializeAuthentication();
    }

    private async initializeAuthentication(): Promise<void> {
        const username = import.meta.env.VITE_JNC_USER;
        const password = import.meta.env.VITE_JNC_PASS;
        
        if (username && password) {
            console.log(`[J-Novel Club] Initializing authentication for user: ${username}`);
            try {
                await this.authenticate(username, password);
                console.log(`[J-Novel Club] Authentication successful`);
            } catch (error) {
                console.log(`[J-Novel Club] Authentication failed: ${error}`);
            }
        } else {
            console.log(`[J-Novel Club] No credentials provided in environment variables`);
        }
    }

    public override get Icon() {
        return icon;
    }

    public override ValidateMangaURL(url: string): boolean {
        return new RegExp(`^${this.URI.origin}/series/[^/]+$`).test(url);
    }

    // Method to handle user authentication
    private async authenticate(email?: string, password?: string): Promise<boolean> {
        // Skip if already authenticated and token not expired
        if (this.authToken && Date.now() < this.tokenExpiry) {
            return true;
        }

        // For now, we don't have user credentials in HakuNeko framework
        // This would need to be extended with a settings/credentials system
        if (!email || !password) {
            console.log(`[J-Novel Club] No credentials provided - using public access only`);
            return false;
        }

        try {
            const loginUrl = 'https://api.j-novel.club/api/auth/login';
            const loginPayload = {
                login: email,
                password: password,
                slim: true
            };

            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(loginPayload)
            });

            if (response.ok) {
                const authData = await response.json();
                this.authToken = authData.id;
                // Set expiry to 90% of TTL to refresh before actual expiry
                this.tokenExpiry = Date.now() + (authData.ttl * 1000 * 0.9);
                console.log(`[J-Novel Club] Successfully authenticated`);
                return true;
            } else {
                console.log(`[J-Novel Club] Authentication failed: ${response.status}`);
                return false;
            }
        } catch (error) {
            console.error(`[J-Novel Club] Authentication error: ${error}`);
            return false;
        }
    }

    // Helper method to create authenticated requests
    private createAuthenticatedRequest(url: string, options: RequestInit = {}): Request {
        const headers = {
            ...options.headers,
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        return new Request(url, {
            ...options,
            headers
        });
    }

    public override async FetchMangas(provider: MangaPlugin): Promise<Manga[]> {
        const mangaList: Manga[] = [];
        for (let page = 1, run = true; run; page++) {
            const mangas = await this.GetMangasFromPage(page, provider);
            mangas.length > 0 ? mangaList.push(...mangas) : run = false;
        }
        return mangaList;
    }

    private async GetMangasFromPage(page: number, provider: MangaPlugin): Promise<Manga[]> {
        const request = new Request(new URL(`/series?page=${page}`, this.URI));
        const data = await FetchCSS(request, 'div.series-card a');
        
        return data.map(element => {
            const anchor = element as HTMLAnchorElement;
            const title = anchor.querySelector('h3')?.textContent?.trim() || anchor.textContent.trim();
            return new Manga(this, provider, anchor.pathname, title);
        });
    }

    public override async FetchPages(chapter: Chapter): Promise<Page[]> {
        try {
            console.log(`[J-Novel Club] Fetching pages for chapter: ${chapter.Identifier}`);
            
            // Extract part ID from chapter identifier (should be in format /read/series-volume-chapter)
            const chapterPath = chapter.Identifier;
            const partSlug = chapterPath.replace('/read/', '');
            
            console.log(`[J-Novel Club] Using part slug: ${partSlug}`);
            
            // Use J-Novel Club API to fetch content
            const apiBaseUrl = 'https://api.j-novel.club/api';
            const embedBaseUrl = 'https://labs.j-novel.club/embed';
            
            // First, try to get part data to find the actual part ID
            // The part slug from URL might need to be converted to part ID
            const partDataUrl = `${apiBaseUrl}/parts/${partSlug}`;
            console.log(`[J-Novel Club] Fetching part data: ${partDataUrl}`);
            
            let partData;
            try {
                const partResponse = await fetch(partDataUrl);
                if (partResponse.ok) {
                    partData = await partResponse.json();
                    console.log(`[J-Novel Club] Part data:`, partData);
                }
            } catch (error) {
                console.log(`[J-Novel Club] Could not fetch part data: ${error}`);
            }
            
            // Try to fetch content using embed API (may require authentication)
            const contentUrl = `${embedBaseUrl}/${partSlug}/data.xhtml`;
            console.log(`[J-Novel Club] Fetching content: ${contentUrl}`);
            
            let contentResponse;
            try {
                // Try with authentication first if available
                const contentRequest = this.createAuthenticatedRequest(contentUrl);
                contentResponse = await fetch(contentRequest);
                
                if (contentResponse.ok) {
                    const contentText = await contentResponse.text();
                    console.log(`[J-Novel Club] Content length: ${contentText.length}`);
                    
                    // Extract image URLs from content
                    const imageUrls = this.extractImageUrlsFromContent(contentText);
                    
                    if (imageUrls.length > 0) {
                        console.log(`[J-Novel Club] Found ${imageUrls.length} image URLs`);
                        return imageUrls.map(url => new Page(this, chapter, new URL(url)));
                    }
                } else if (contentResponse.status === 401 || contentResponse.status === 403) {
                    console.log(`[J-Novel Club] Content requires authentication or subscription`);
                }
            } catch (error) {
                console.log(`[J-Novel Club] Could not fetch content: ${error}`);
            }
            
            // Fallback: try the old approach with part ID extraction
            const chapterUrl = new URL(chapterPath, this.URI).href;
            console.log(`[J-Novel Club] Fallback: fetching chapter page: ${chapterUrl}`);
            
            const chapterRequest = new Request(chapterUrl);
            const chapterData = await FetchHTML(chapterRequest);
            
            // Look for part ID in the page data
            const scriptTag = chapterData.querySelector('#__NEXT_DATA__');
            if (!scriptTag) {
                throw new Error('Could not find chapter data script');
            }
            
            const jsonData = JSON.parse(scriptTag.textContent);
            const partId = jsonData?.props?.pageProps?.part?.id;
            
            if (!partId) {
                throw new Error('Could not extract part ID from chapter data');
            }
            
            console.log(`[J-Novel Club] Extracted part ID: ${partId}`);
            
            // Try to fetch content with the part ID
            const partContentUrl = `${embedBaseUrl}/${partId}/data.xhtml`;
            console.log(`[J-Novel Club] Fetching part content: ${partContentUrl}`);
            
            try {
                const partRequest = this.createAuthenticatedRequest(partContentUrl);
                const partResponse = await fetch(partRequest);
                
                if (partResponse.ok) {
                    const partContentText = await partResponse.text();
                    console.log(`[J-Novel Club] Part content length: ${partContentText.length}`);
                    
                    const imageUrls = this.extractImageUrlsFromContent(partContentText);
                    
                    if (imageUrls.length > 0) {
                        console.log(`[J-Novel Club] Found ${imageUrls.length} image URLs from part content`);
                        return imageUrls.map(url => new Page(this, chapter, new URL(url)));
                    }
                } else if (partResponse.status === 401 || partResponse.status === 403) {
                    console.log(`[J-Novel Club] Part content requires authentication or subscription`);
                }
            } catch (error) {
                console.log(`[J-Novel Club] Could not fetch part content: ${error}`);
            }
            
            // If we still can't get content, check if this is DRM-protected
            const embedUrl = `https://labs.j-novel.club/embed/v2/${partId}`;
            const embedRequest = new Request(embedUrl, {
                headers: {
                    'Referer': chapterUrl
                }
            });

            const embedData = await FetchHTML(embedRequest);
            const body = embedData.querySelector('body');
            const manifestUrl = body?.getAttribute('data-e4p-manifest');
            const isDrmProtected = manifestUrl && manifestUrl.includes('flame.jnc-cps.nexus');
            
            if (isDrmProtected) {
                console.log(`[J-Novel Club] Content is DRM-protected and requires subscription`);
                return [new Page(this, chapter, new URL('https://via.placeholder.com/800x1200.png?text=DRM+Protected+Content+Requires+Subscription'))];
            }
            
            console.log(`[J-Novel Club] No image URLs found, using placeholder`);
            return [new Page(this, chapter, new URL('https://via.placeholder.com/800x1200.png?text=Content+Not+Available'))];
            
        } catch (error) {
            console.error(`[J-Novel Club] Error fetching pages: ${error}`);
            return [new Page(this, chapter, new URL('https://via.placeholder.com/800x1200.png?text=Error+Loading+Content'))];
        }
    }

    private extractImageUrlsFromContent(content: string): string[] {
        const imageUrls: string[] = [];
        
        try {
            // Look for various image URL patterns in the content
            const patterns = [
                // CloudFront CDN (primary pattern)
                /https:\/\/d2dq7ifhe7bu0t\.cloudfront\.net\/[^"'\s]+/g,
                // J-Novel Club CDN
                /https:\/\/cdn\.j-novel\.club\/[^"'\s]+\.(jpg|jpeg|png|webp)/gi,
                // Other CDN patterns
                /https:\/\/[^"'\s]*\.amazonaws\.com\/[^"'\s]+\.(jpg|jpeg|png|webp)/gi,
                // General image URLs in content
                /"(https:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi
            ];
            
            for (const pattern of patterns) {
                const matches = content.match(pattern) || [];
                for (const match of matches) {
                    // Clean up the URL (remove quotes if present)
                    const cleanUrl = match.replace(/['"]/g, '');
                    if (cleanUrl.includes('.') && (cleanUrl.includes('.jpg') || cleanUrl.includes('.jpeg') || cleanUrl.includes('.png') || cleanUrl.includes('.webp'))) {
                        imageUrls.push(cleanUrl);
                    }
                }
            }
            
        } catch (error) {
            console.log(`[J-Novel Club] Error extracting image URLs: ${error}`);
        }
        
        // Remove duplicates
        return [...new Set(imageUrls)];
    }

    private extractImageUrlsFromManifest(manifestData: any): string[] {
        const imageUrls: string[] = [];
        
        try {
            // The manifest might have different structures, try common patterns
            if (manifestData.pages && Array.isArray(manifestData.pages)) {
                for (const page of manifestData.pages) {
                    if (page.url || page.src || page.image) {
                        const url = page.url || page.src || page.image;
                        if (typeof url === 'string' && url.includes('cloudfront.net')) {
                            imageUrls.push(url);
                        }
                    }
                }
            }
            
            // Try other possible structures
            if (manifestData.images && Array.isArray(manifestData.images)) {
                for (const image of manifestData.images) {
                    if (typeof image === 'string' && image.includes('cloudfront.net')) {
                        imageUrls.push(image);
                    } else if (image.url && typeof image.url === 'string' && image.url.includes('cloudfront.net')) {
                        imageUrls.push(image.url);
                    }
                }
            }
            
            // Try to extract from any nested objects
            const jsonStr = JSON.stringify(manifestData);
            const urlMatches = jsonStr.match(/https:\/\/[^"]*cloudfront\.net[^"]*/g) || [];
            imageUrls.push(...urlMatches);
            
        } catch (error) {
            console.log(`[J-Novel Club] Error parsing manifest: ${error}`);
        }
        
        // Remove duplicates
        return [...new Set(imageUrls)];
    }

    public override async FetchImage(page: Page, priority: Priority, signal: AbortSignal): Promise<Blob> {
        // The page should have the image URL stored in its Parameters.url property
        const imageUrl = page.Link?.href;
        
        if (imageUrl && imageUrl.startsWith('https://d2dq7ifhe7bu0t.cloudfront.net/')) {
            const request = new Request(imageUrl, {
                headers: {
                    'Referer': 'https://labs.j-novel.club/'
                }
            });
            
            const response = await fetch(request, { signal });
            return response.blob();
        }
        
        // Fallback: return placeholder PNG blob for testing
        const pngBytes = new Uint8Array([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
            0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
            0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
            0x42, 0x60, 0x82
        ]);
        return new Blob([pngBytes], { type: 'image/png' });
    }

    // Comment out custom FetchChapters temporarily to see what the decorator produces
    /*
    public override async FetchChapters(manga: Manga): Promise<Chapter[]> {
        const request = new Request(new URL(manga.Identifier, this.URI));
        const data = await FetchCSS(request, 'div.f1vdb00x.manga');
        
        const chapters: Chapter[] = [];
        
        for (const volume of data) {
            // Get volume title from the h2 element
            const volumeTitle = volume.querySelector('h2 a')?.textContent?.trim() || 'Unknown Volume';
            
            // Get all chapter links within this volume that are not unavailable
            const chapterLinks = [...volume.querySelectorAll('div.f12k8ro3 a.f122npxj.f1ppn23n:not(.unavailable)')];
            
            for (const link of chapterLinks) {
                const anchor = link as HTMLAnchorElement;
                const chapterSpans = [...anchor.querySelectorAll('span')];
                const chapterText = chapterSpans[chapterSpans.length - 1]?.textContent?.trim() || 'Unknown';
                
                // If the chapter text already contains "Chapter", use it as is
                // Otherwise prepend "Chapter" to it
                let title: string;
                if (chapterText.toLowerCase().includes('chapter')) {
                    title = `${volumeTitle} - ${chapterText}`;
                } else {
                    title = `${volumeTitle} - Chapter ${chapterText}`;
                }
                
                chapters.push(new Chapter(this, manga, anchor.pathname, title));
            }
        }
        
        return chapters;
    }
    */
}