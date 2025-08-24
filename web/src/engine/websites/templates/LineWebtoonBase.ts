import { Chapter, DecoratableMangaScraper, type Manga, type MangaPlugin, Page } from '../../providers/MangaPlugin';
import * as Common from '../decorators/Common';
import { Fetch, FetchCSS, FetchJSON, FetchWindowScript } from '../../platform/FetchProvider';
import { Priority } from '../../taskpool/DeferredTask';
import { TaskPool } from '../../taskpool/TaskPool';
import { RateLimit } from '../../taskpool/RateLimit';

// API response types
type EpisodeInfo = {
    message: {
        result: {
            episode: {
                episodeNo: number;
                title: string;
                webtoonLevelCode: number;
                serviceScenario: string;
                pictureInfos: PictureInfo[];
            };
        };
    };
};

type PictureInfo = {
    url: string;
    width: number;
    height: number;
    type?: string;
};

type ChapterInfo = {
    episodeNo: number;
    title: string;
    thumbnailUrl: string;
    serviceDateDescription: string;
    readableProduct: boolean;
};

@Common.MangasNotSupported()
export class LineWebtoonBase extends DecoratableMangaScraper {
    protected mangaRegexp = /[a-z]{2}\/[^/]+\/[^/]+\/list\?title_no=\d+$/;
    protected queryMangaTitleURI = 'div.info .subj';
    protected mangaLabelExtractor = Common.ElementLabelExtractor();
    private readonly interactionTaskPool = new TaskPool(1, RateLimit.PerMinute(30));

    // Get NEO_SES from environment variable
    private getNeoSesCookie(): string | null {
        try {
            // Try to get from process.env (Node.js environment)
            if (typeof process !== 'undefined' && process.env?.NEO_SES) {
                return process.env.NEO_SES;
            }
            
            // For browser environment, you might need a different approach
            // This depends on how your build system handles environment variables
            return null;
        } catch (error) {
            console.warn('Could not access NEO_SES from environment:', error);
            return null;
        }
    }

    // Create authenticated request headers
    private getAuthenticatedHeaders(referer?: string): Record<string, string> {
        const headers: Record<string, string> = {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };

        if (referer) {
            headers['Referer'] = referer;
        }

        const neoSes = this.getNeoSesCookie();
        if (neoSes) {
            headers['Cookie'] = `NEO_SES=${neoSes}`;
            console.log('Added NEO_SES cookie for authentication');
        } else {
            console.warn('NEO_SES cookie not found in environment variables');
        }

        return headers;
    }

    public override ValidateMangaURL(url: string): boolean {
        return this.mangaRegexp.test(url) && url.startsWith(this.URI.origin);
    }

    public override async FetchManga(provider: MangaPlugin, url: string): Promise<Manga> {
        return this.interactionTaskPool.Add(async () => 
            Common.FetchMangaCSS.call(this, provider, url, this.queryMangaTitleURI, this.mangaLabelExtractor, true, false), 
            Priority.Normal
        );
    }

    public override async FetchChapters(manga: Manga): Promise<Chapter[]> {
        // Extract title_no from manga identifier
        const titleNoMatch = manga.Identifier.match(/title_no=(\d+)/);
        if (!titleNoMatch) {
            throw new Error('Could not extract title_no from manga URL');
        }
        
        const titleNo = titleNoMatch[1];
        const chapterList: Chapter[] = [];
        
        // Get chapter list using API or fallback to web scraping
        try {
            const chapters = await this.GetChaptersFromAPI(manga, titleNo);
            chapterList.push(...chapters);
        } catch (error) {
            console.warn('API fetch failed, falling back to web scraping:', error);
            // Fallback to original web scraping method
            for (let page = 1, run = true; run; page++) {
                const chapters = await this.GetChaptersFromPage(manga, page);
                chapterList.isMissingLastItemFrom(chapters) ? chapterList.push(...chapters) : run = false;
            }
        }
        
        return chapterList.distinct();
    }

    private async GetChaptersFromAPI(manga: Manga, titleNo: string): Promise<Chapter[]> {
        // This would require implementing a way to get the chapter list
        // LINE Webtoon might have a separate endpoint for this
        // For now, we'll use the fallback method
        throw new Error('Chapter list API not implemented yet');
    }

    private async GetChaptersFromPage(manga: Manga, page: number): Promise<Chapter[]> {
        const request = new Request(new URL(`${manga.Identifier}&page=${page}`, this.URI), {
            headers: this.getAuthenticatedHeaders()
        });

        const data = await this.interactionTaskPool.Add(async () => 
            FetchCSS<HTMLAnchorElement>(request, 'div.detail_body div.detail_lst ul li > a'), 
            Priority.Normal
        );
        return data.map(element => {
            const { id, title } = this.extractChapterInfo(element);
            return new Chapter(this, manga, id, title);
        });
    }

    private extractChapterInfo(element: HTMLAnchorElement) {
        const chapter = element.querySelector('span.tx');
        let title = chapter ? chapter.textContent.trim() + ' - ' : '';
        title += element.querySelector('span.subj span').textContent.trim();
        const id = /'/.test(element.href) ? decodeURIComponent(element.href).match(/'([^']+)'/)[1] : element.pathname + element.search;
        return { id, title };
    }

    public override async FetchPages(chapter: Chapter): Promise<Page[]> {
        // Extract episode number from chapter identifier
        const episodeMatch = chapter.Identifier.match(/episode_no=(\d+)/);
        if (!episodeMatch) {
            throw new Error('Could not extract episode_no from chapter URL');
        }

        const episodeNo = episodeMatch[1];
        
        try {
            // Try to use the API endpoint
            return await this.GetPagesFromAPI(chapter, episodeNo);
        } catch (error) {
            console.warn('API fetch failed, falling back to web scraping:', error);
            // Fallback to original method
            return await this.GetPagesFromWebScraping(chapter);
        }
    }

    private async GetPagesFromAPI(chapter: Chapter, episodeNo: string): Promise<Page[]> {
        const apiUrl = new URL('/lineWebtoon/webtoon/episodeInfoWithLogin.json', this.URI);
        apiUrl.searchParams.set('episodeNo', episodeNo);
        
        // Extract title_no from chapter's manga identifier
        const titleNoMatch = chapter.Parent.Identifier.match(/title_no=(\d+)/);
        if (titleNoMatch) {
            apiUrl.searchParams.set('titleNo', titleNoMatch[1]);
        }

        const refererUrl = new URL(chapter.Identifier, this.URI).href;
        const request = new Request(apiUrl, {
            headers: this.getAuthenticatedHeaders(refererUrl)
        });

        console.log(`Fetching episode info from API: ${apiUrl.toString()}`);

        const response = await this.interactionTaskPool.Add(async () => 
            FetchJSON<EpisodeInfo>(request), 
            Priority.Normal
        );

        console.log('API Response:', JSON.stringify(response, null, 2));

        if (!response.message?.result?.episode?.pictureInfos) {
            throw new Error('Invalid API response structure');
        }

        const pictureInfos = response.message.result.episode.pictureInfos;
        console.log(`Found ${pictureInfos.length} images in API response`);
        
        return pictureInfos.map((picture, index) => {
            const pageUrl = new URL(picture.url);
            pageUrl.searchParams.delete('type'); // Remove type parameter as in original code
            
            return new Page(this, chapter, pageUrl, {
                Referer: refererUrl,
                width: picture.width,
                height: picture.height,
                index: index
            });
        });
    }

    private async GetPagesFromWebScraping(chapter: Chapter): Promise<Page[]> {
        // Original web scraping implementation as fallback
        const defaultPageScript = `
            new Promise(async (resolve, reject) => {
                try {
                    const images = [...document.querySelectorAll('div.viewer div.viewer_lst div.viewer_img img[data-url]')];
                    const links = images.map(element => new URL(element.dataset.url, window.location).href);
                    resolve(links);
                } catch (error) {
                    reject(error);
                }
            });
        `;

        const request = new Request(new URL(chapter.Identifier, this.URI), {
            headers: this.getAuthenticatedHeaders()
        });

        const data = await this.interactionTaskPool.Add(async () => 
            FetchWindowScript(request, defaultPageScript, 1500), 
            Priority.Normal
        );

        if (!Array.isArray(data)) return [];
        
        return (data as Array<string>).map(page => {
            const pageUrl = new URL(page);
            pageUrl.searchParams.delete('type');
            return new Page(this, chapter, pageUrl);
        });
    }

    public override async FetchImage(page: Page, priority: Priority, signal: AbortSignal): Promise<Blob> {
        return this.interactionTaskPool.Add(async () => 
            Common.FetchImageAjax.call(this, page, priority, signal, true), 
            Priority.Normal
        );
    }

    // Helper method to check if user is logged in (has NEO_SES cookie)
    protected async isLoggedIn(): Promise<boolean> {
        return this.getNeoSesCookie() !== null;
    }
}