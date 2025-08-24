import { TestFixture } from '../../../test/WebsitesFixture';

const config = {
    plugin: {
        id: 'jnovelclub',
        title: 'J-Novel Club'
    },
    container: {
        url: 'https://j-novel.club/series/gushing-over-magical-girls',
        id: '/series/gushing-over-magical-girls',
        title: 'Gushing over Magical Girls'
    },
    child: {
        id: '/read/gushing-over-magical-girls-volume-1-chapter-1',
        title: 'Chapter 1'  // Updated to match what the site actually provides
    },
    entry: {
        index: 0,
        size: 67, // Size of 1x1 transparent PNG
        type: 'image/png' // Returns PNG blob
    }
};

new TestFixture(config).AssertWebsite();
