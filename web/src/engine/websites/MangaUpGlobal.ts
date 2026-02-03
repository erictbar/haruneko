import { Tags } from '../Tags';
import icon from './MangaUpGlobal.webp';
import protoTypes from './MangaUpGlobal.proto?raw';
import { GetBytesFromHex } from '../BufferEncoder';
import { Exception } from '../Error';
import { WebsiteResourceKey as W } from '../../i18n/ILocale';
import type { Priority } from '../taskpool/DeferredTask';
import { Fetch, FetchProto } from '../platform/FetchProvider';
import { DecoratableMangaScraper, type MangaPlugin, Manga, Chapter, Page } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';

type APIMangaDetailView = {
    titleName: string;
    chapters: APIChapter[];
};

type APISearch = {
    titles: APIManga[]
};

type APIManga = {
    titleId: number;
    titleName: string;
};

type APIChapter = {
    id: number;
    titleName: string;
    subName: string;
};

type APIPages = {
    pageblocks: {
        pages: {
            imageUrl: string;
            encryptionKey: string;
            iv: string | undefined;
        }[]
    }[]
};

type PageParameters = {
    keyData?: string;
    iv?: string;
};

export default class extends DecoratableMangaScraper {

    private readonly apiUrl = 'https://global-api.manga-up.com/api/';
    private readonly imagesCDN = 'https://global-img.manga-up.com/';
    private readonly secret = import.meta.env.VITE_MANGAUP_SECRET || '';

    // Helper method to build authenticated URLs
    private buildApiUrl(endpoint: string, additionalParams: Record<string, string> = {}): URL {
        const url = new URL(endpoint, this.apiUrl);
        const params = {
            secret: this.secret,
            app_ver: '0',
            os_ver: '0',
            ui_lang: 'en',
            ...additionalParams
        };
        
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });
        
        return url;
    }

    public constructor() {
        super('mangaupglobal', `MangaUp (Global)`, `https://global.manga-up.com`, Tags.Language.English, Tags.Media.Manga, Tags.Source.Official);
        console.log('MangaUp Secret loaded:', this.secret ? 'Yes' : 'No'); // Remove this after testing
    }
    public override get Icon() {
        return icon;
    }

    public override ValidateMangaURL(url: string): boolean {
        return new RegExpSafe(`^${this.URI.origin}/manga/[\\d]+$`).test(url);
    }

    public override async FetchManga(provider: MangaPlugin, url: string): Promise<Manga> {
        const mangaid = url.split('/').at(-1);
        const request = new Request(this.buildApiUrl('./manga/detail_v2', { 
            title_id: mangaid, 
            quality: 'middle' 
        }));
        const { titleName } = await FetchProto<APIMangaDetailView>(request, protoTypes, 'MangaUpGlobal.MangaDetailView');
        return new Manga(this, provider, mangaid, titleName);
    }

    public override async FetchMangas(provider: MangaPlugin): Promise<Manga[]> {
        const request = new Request(this.buildApiUrl('./search'));
        const { titles } = await FetchProto<APISearch>(request, protoTypes, 'MangaUpGlobal.SearchView');
        return titles.map(manga => new Manga(this, provider, manga.titleId.toString(), manga.titleName.trim()));
    }

    public override async FetchChapters(manga: Manga): Promise<Chapter[]> {
        const request = new Request(this.buildApiUrl('./manga/detail_v2', { 
            title_id: manga.Identifier, 
            quality: 'middle' 
        }));
        const { chapters } = await FetchProto<APIMangaDetailView>(request, protoTypes, 'MangaUpGlobal.MangaDetailView');
        return chapters.map(chapter => new Chapter(this, manga, chapter.id.toString(), [chapter.titleName, chapter.subName].join(' ').trim()));
    }

    public override async FetchPages(chapter: Chapter): Promise<Page<PageParameters>[]> {
        const request = new Request(this.buildApiUrl('./manga/viewer_v2', { 
            chapter_id: chapter.Identifier, 
            quality: 'high' 
        }), { method: 'POST' });
        
        const data = await FetchProto<APIPages>(request, protoTypes, 'MangaUpGlobal.MangaViewerV2View');

        if (!data.pageblocks || data.pageblocks.length === 0) {
            throw new Exception(W.Plugin_Common_Chapter_UnavailableError);
        }

        return data.pageblocks.shift().pages.map(page => {
            const params: PageParameters = page.iv ? {
                keyData: page.encryptionKey,
                iv: page.iv
            } : {};
            return new Page<PageParameters>(this, chapter, new URL(page.imageUrl, this.imagesCDN), params);
        });
    }

    public override async FetchImage(page: Page<PageParameters>, priority: Priority, signal: AbortSignal): Promise<Blob> {
        const bytes = await this.imageTaskPool.Add(async () => {
            const response = await Fetch(new Request(page.Link, { signal }));
            return response.arrayBuffer();
        }, priority, signal);
        const { keyData, iv } = page.Parameters;
        return keyData && iv ? this.DecryptImage(bytes, keyData, iv) : Common.GetTypedData(bytes);
    }

    private async DecryptImage(encrypted: ArrayBuffer, keyData: string, iv: string) {
        const algorithm = { name: 'AES-CBC', iv: GetBytesFromHex(iv) };
        const key = await crypto.subtle.importKey('raw', GetBytesFromHex(keyData), algorithm, false, [ 'decrypt' ]);
        const decrypted = await crypto.subtle.decrypt(algorithm, key, encrypted);
        return Common.GetTypedData(decrypted);
    }
}