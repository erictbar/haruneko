// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { TryGetMediaFromClipboardURL } from './ClipboardMedia';

type FakeManga = {
    Identifier: string;
    Title: string;
    Parent: {
        CreateEntry: (identifier: string, title: string) => FakeManga;
    };
};

function CreateMedia(identifier: string, title: string): FakeManga {
    return {
        Identifier: identifier,
        Title: title,
        Parent: {
            CreateEntry: (nextIdentifier: string, nextTitle: string) => CreateMedia(nextIdentifier, nextTitle),
        },
    };
}

describe('TryGetMediaFromClipboardURL()', () => {

    it('Should return direct plugin match', async () => {
        const media = CreateMedia('/en/comic/im_no_heroine', `I'm No Heroine!`);
        globalThis.HakuNeko = {
            PluginController: {
                WebsitePlugins: [
                    {
                        TryGetEntry: async (url: string) => url === 'https://www.lezhinus.com/en/comic/im_no_heroine' ? media : undefined,
                    }
                ]
            }
        } as typeof HakuNeko;

        const actual = await TryGetMediaFromClipboardURL('https://www.lezhinus.com/en/comic/im_no_heroine');

        expect(actual).toBe(media);
    });

    it('Should resolve Lezhin chapter URL from parent manga URL', async () => {
        const media = CreateMedia('/en/comic/icequeen_masochist', 'Ice Queen Masochist');
        globalThis.HakuNeko = {
            PluginController: {
                WebsitePlugins: [
                    {
                        TryGetEntry: async (url: string) => url === 'https://www.lezhinus.com/en/comic/icequeen_masochist' ? media : undefined,
                    }
                ]
            }
        } as typeof HakuNeko;

        const actual = await TryGetMediaFromClipboardURL('https://www.lezhinus.com/en/library/comic/en-US/icequeen_masochist/20');

        expect(actual?.Identifier).toBe('/en/library/comic/en-US/icequeen_masochist/20');
        expect(actual?.Title).toBe('Ice Queen Masochist');
    });

    it('Should normalize old Lezhin chapter URL to library chapter identifier', async () => {
        const media = CreateMedia('/en/comic/undermyskin', 'Under My Skin');
        globalThis.HakuNeko = {
            PluginController: {
                WebsitePlugins: [
                    {
                        TryGetEntry: async (url: string) => url === 'https://www.lezhinus.com/en/comic/undermyskin' ? media : undefined,
                    }
                ]
            }
        } as typeof HakuNeko;

        const actual = await TryGetMediaFromClipboardURL('https://www.lezhinus.com/en/comic/undermyskin/1');

        expect(actual?.Identifier).toBe('/en/library/comic/en-US/undermyskin/1');
        expect(actual?.Title).toBe('Under My Skin');
    });
});