import { describe, expect, it } from 'vitest';
import { GetContentCuts } from './LezhinBase';

describe('GetContentCuts()', () => {

    it('Should use pageView when it has content pages', async () => {
        const actual = GetContentCuts([
            { path: '/page/1', shuffleKey: '1', cutType: 'contents' },
            { path: '/page/top', shuffleKey: '1', cutType: 'top' },
        ], [
            { path: '/scroll/1', shuffleKey: '1', cutType: 'contents' },
        ]);

        expect(actual).toStrictEqual([
            { path: '/page/1', shuffleKey: '1', cutType: 'contents' },
        ]);
    });

    it('Should fall back to scrollView when pageView is empty', async () => {
        const actual = GetContentCuts([], [
            { path: '/scroll/top', shuffleKey: '1', cutType: 'top' },
            { path: '/scroll/1', shuffleKey: '1', cutType: 'contents' },
            { path: '/scroll/bottom', shuffleKey: '1', cutType: 'bottom' },
        ]);

        expect(actual).toStrictEqual([
            { path: '/scroll/1', shuffleKey: '1', cutType: 'contents' },
        ]);
    });
});