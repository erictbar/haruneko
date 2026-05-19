import type { Manga } from '../engine/providers/MangaPlugin';

export async function TryGetMediaFromClipboardURL(link: string): Promise<Manga | undefined> {
    for (const website of HakuNeko.PluginController.WebsitePlugins) {
        const media = await website.TryGetEntry(link) as Manga;
        if (media) {
            return media;
        }
    }

    return TryGetLezhinChapterMedia(link);
}

async function TryGetLezhinChapterMedia(link: string): Promise<Manga | undefined> {
    const uri = new URL(link);
    const chapterMatch = uri.pathname.match(/^\/(en|ko)\/library\/comic\/[A-Za-z-]+\/([^/]+)\/([^/]+)$/);
    const oldChapterMatch = uri.pathname.match(/^\/(en|ko)\/comic\/([^/]+)\/([^/]+)$/);

    if (!chapterMatch && !oldChapterMatch) {
        return undefined;
    }

    const languagePath = (chapterMatch ?? oldChapterMatch)[1];
    const alias = (chapterMatch ?? oldChapterMatch)[2];
    const episodeName = (chapterMatch ?? oldChapterMatch)[3];
    const locale = languagePath === 'en' ? 'en-US' : 'ko-KR';
    const mangaURL = new URL(`/${languagePath}/comic/${alias}`, uri.origin).href;

    for (const website of HakuNeko.PluginController.WebsitePlugins) {
        const media = await website.TryGetEntry(mangaURL) as Manga;
        if (media) {
            const identifier = oldChapterMatch
                ? `/${languagePath}/library/comic/${locale}/${alias}/${episodeName}`
                : uri.pathname + uri.search;
            return media.Parent.CreateEntry(identifier, media.Title);
        }
    }

    return undefined;
}