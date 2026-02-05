import { TestFixture } from '../../../test/WebsitesFixture';

new TestFixture({
    plugin: {
        id: 'daycomics',
        title: 'Daycomics (TOPTOON Global)'
    },
    container: {
        url: 'https://global.toptoon.com/comic/102620',
        id: '/comic/102620',
        title: 'Big Sized Disciple'
    },
    child: {
        id: '/content/102620/135300',
        title: 'Episode 1'
    },
    entry: {
        index: 0,
        size: -1,
        type: 'image/jpeg'
    }
}).AssertWebsite();
