import { describe, it, expect } from 'vitest';
import { SanitizeFileName } from './StorageController';

describe('StorageController', () => {

    describe('SanitizeFileName', () => {

        it('Should replace forbidden characters', () => {
            expect(SanitizeFileName('< > : " / \\ | ? * ~')).toBe('＜ ＞ ꞉ ＂ ／ ＼ ｜ ？ ＊ ～');
        });

        it.each([
            ['😎.', '😎․'],
            ['😎..', '😎․․'],
            ['😎...', '😎․․․'],
            ['😎 . .. ', '😎 . ․․'],
            ['😎 .. . ', '😎 .. ․'],
        ])('Should replace trailing dots', (input, expected) => {
            expect(SanitizeFileName(input)).toBe(expected);
        });

        it.each([
            ['.😎', '.😎'],
            ['..😎', '․․😎'],
            ['...😎', '․․․😎'],
            [' .. . 😎', '․․ . 😎'],
            [' . .. 😎', '. .. 😎'],
        ])('Should replace leading dots', (input, expected) => {
            expect(SanitizeFileName(input)).toBe(expected);
        });

        it('Should truncate names exceeding maximum length', () => {
            const longName = 'a'.repeat(150);
            const result = SanitizeFileName(longName);
            expect(result.length).toBeLessThanOrEqual(100);
        });

        it('Should handle very long chapter titles', () => {
            const longTitle = "Fail 200 -1 I'm not popular, so since It's chapter 200, here are five vignettes of the best pairings chosen for our tenth anniversary.";
            const result = SanitizeFileName(longTitle);
            expect(result.length).toBeLessThanOrEqual(100);
            // Verify it starts correctly and was truncated
            expect(result).toContain("Fail 200 -1 I'm not popular");
            expect(result.length).toBeGreaterThan(80); // Ensure meaningful truncation
        });
    });
});