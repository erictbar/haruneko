import { FetchCSS, FetchWindowScript } from "../../platform/FetchProvider";
import { type MangaScraper, type MangaPlugin, type Manga, Chapter, type Page, DecoratableMangaScraper } from '../../providers/MangaPlugin';
import type { Priority } from '../../taskpool/DeferredTask';
import * as Common from "../decorators/Common";

export function WebsiteInfoExtractor(appendLanguage: boolean = true) {
    return function (this: MangaScraper, titleElement: HTMLElement, url: URL) {
        const language = ExtractLanguage(url.pathname);
        return {
            id: url.pathname,
            title: [titleElement.dataset.toonName?.trim() ?? titleElement.textContent.trim(), appendLanguage ? `[${language}]` : ''].join(' ').trim()
        };
    };
};
function MangaInfoExtractor(appendLanguage: boolean = true) {
    return function (this: MangaScraper, element: HTMLAnchorElement) {
        const language = ExtractLanguage(element.pathname);
        const title = (element.querySelector('h4.title, h4') ?? element).textContent.trim();
        return {
            id: element.pathname,
            title: appendLanguage ? [title, `[${language}]`].join(' ').trim() : title
        };
    };
};

function ExtractLanguage(text: string): string {
    return text.match(/^\/([a-z]{2,3})\//)?.at(1) ?? '';
};

export function PageExtractor(element: HTMLElement) {
    if (element.tagName === 'SOURCE') {
        return element.getAttribute('src') || '';
    }
    const img = element as HTMLImageElement;
    return img.dataset.original || img.dataset.src || img.getAttribute('src') || '';
}

@Common.PagesSinglePageCSS('#viewer-img img, #viewer-img video source', PageExtractor)
export class ToomicsBase extends DecoratableMangaScraper {
    protected languages: string[] = ['en'];
    protected mangaPath = '/{language}/webtoon/ranking';
    protected queryMangas = 'div.list-wrap ul li a, div.list_wrap ul li a';
    protected queryChapters = 'ol.list-ep li.normal_ep a, ul.ep__list li a';
    protected queryChapterTitle = 'div.cell-title strong, div.ep__name';
    protected queryChapterNum = 'div[class*="ep__turning"], div.cell-num';
    protected customChapterUrlPattern: RegExp = undefined;

    public override async FetchMangas(provider: MangaPlugin): Promise<Manga[]> {
        const mangalist: Manga[] = [];
        for (const language of this.languages) {
            const mangas = await Common.FetchMangasSinglePageCSS.call(this, provider, this.mangaPath.replace('{language}', language), this.queryMangas, MangaInfoExtractor(this.languages.length > 1));
            mangalist.push(...mangas);
        }
        return mangalist.distinct();
    }

    public override async FetchChapters(manga: Manga): Promise<Chapter[]> {
        const nodes = await FetchCSS<HTMLAnchorElement>(new Request(new URL(manga.Identifier, this.URI)), this.queryChapters);
        const mangaTitle = this.languages.length > 1 ? manga.Title.replace(/\[.*\]$/, '').trim() : manga.Title;
        return nodes.map(anchor => {

            const chaptertitle = anchor.querySelector(this.queryChapterTitle).textContent.trim();
            const chapterNum = anchor.querySelector(this.queryChapterNum).textContent.trim();
            const title = [chapterNum, chaptertitle].join(' ').trim();

            //First try to build matching url from dataset element if they exists
            let id = '';
            const lang = ExtractLanguage(manga.Identifier);

            if (anchor.dataset.e && anchor.dataset.c && anchor.dataset.v) {
                id = lang ? `/${lang}` : '';
                id += `/webtoon/detail/code/${window.atob(anchor.dataset.c)}/ep/${window.atob(anchor.dataset.v)}/toon/${window.atob(anchor.dataset.e)}`;
            }
            else {
                //look for url pattern in "onclick"
                const action = anchor.getAttribute('onclick');
                const regexp = this.customChapterUrlPattern ? this.customChapterUrlPattern : lang ? new RegExp(`/${lang}/webtoon/detail/code/\\d+/ep/\\d+/toon/\\d+`) : new RegExp(`/webtoon/detail/code/\\d+/ep/\\d+/toon/\\d+`);
                id = action?.match(regexp)?.at(0);
            }
            return new Chapter(this, manga, new URL(id ?? anchor.pathname, this.URI).pathname, title.replace(mangaTitle, '').trim());
        });
    }

    public override async FetchImage(page: Page, priority: Priority, signal: AbortSignal): Promise<Blob> {
        const blob = await Common.FetchImageAjax.call(this, page, priority, signal, false);
        if (!blob.type.startsWith('video/')) {
            return Common.GetTypedData(await blob.arrayBuffer());
        }
        const videoUrl = page.Link.href;
        const script = `(async () => {
            const response = await fetch(${JSON.stringify(videoUrl)});
            const videoBlob = await response.blob();
            const blobUrl = URL.createObjectURL(videoBlob);
            try {
                const video = document.createElement('video');
                video.muted = true;
                video.preload = 'auto';
                video.src = blobUrl;
                await new Promise((resolve, reject) => {
                    video.addEventListener('loadedmetadata', () => { video.currentTime = 0.001; }, { once: true });
                    video.addEventListener('seeked', resolve, { once: true });
                    video.addEventListener('error', () => reject(new Error('video load error')), { once: true });
                });
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 720;
                canvas.height = video.videoHeight || 720;
                canvas.getContext('2d').drawImage(video, 0, 0);
                return canvas.toDataURL('image/webp', 0.9);
            } finally {
                URL.revokeObjectURL(blobUrl);
            }
        })()`;
        const dataURL = await FetchWindowScript<string>(new Request(this.URI), script);
        const match = dataURL?.match(/^data:([^;]+);base64,(.+)$/s);
        if (!match) return blob;
        const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
        return new Blob([bytes], { type: match[1] });
    }
}