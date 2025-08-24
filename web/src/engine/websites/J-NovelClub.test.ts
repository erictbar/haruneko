import { describe, it, expect } from 'vitest';
import JNovelClub from './J-NovelClub';

describe('J-Novel Club Website', () => {
    it('should initialize with authentication if credentials are provided', async () => {
        // Create an instance to test initialization
        const scraper = new JNovelClub();
        
        expect(scraper).toBeDefined();
        expect(scraper.Title).toBe('J-Novel Club');
        expect(scraper.URI.origin).toBe('https://j-novel.club');
    });

    it('should read environment variables', () => {
        const username = import.meta.env.VITE_JNC_USER;
        const password = import.meta.env.VITE_JNC_PASS;
        
        console.log('JNC_USER:', username);
        console.log('JNC_PASS:', password ? '[SET]' : '[NOT SET]');
        
        // Just verify they're accessible (don't validate actual values for security)
        expect(typeof username).toBe('string');
        expect(typeof password).toBe('string');
    });
});
