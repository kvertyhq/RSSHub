import { describe, expect, it, vi } from 'vitest';

import type * as configType from '@/config';

import { route } from './routes/instagram/gocals/index';

vi.mock('@/config', async (importOriginal) => {
    const actual = await importOriginal<typeof configType>();
    return {
        ...actual,
        config: {
            ...actual.config,
            instagram: {
                ...actual.config?.instagram,
                cookie: 'sessionid=mock_cookie_id',
            },
        },
    };
});

vi.mock('./routes/instagram/common-utils', () => ({
    renderItems: vi.fn().mockReturnValue([
        {
            title: 'Caption content',
            id: 'post123',
            pubDate: new Date(1_689_000_000 * 1000),
            author: 'instagram',
            link: 'https://www.instagram.com/p/C_abc123/',
            summary: 'Caption content',
            description: 'Caption content description',
        },
    ]),
}));

vi.mock('./routes/instagram/web-api/utils', () => ({
    baseUrl: 'https://www.instagram.com',
    checkLogin: vi.fn().mockResolvedValue(true),
    COOKIE_URL: 'https://www.instagram.com',
    getUserInfo: vi.fn().mockResolvedValue({
        id: '123456',
        username: 'instagram',
    }),
    getUserFeedItems: vi.fn().mockResolvedValue([]),
}));

describe('instagram:gocals', () => {
    it('gocals aggregated route handler returns aggregated and sorted data', async () => {
        const mockCtx = {
            set: vi.fn(),
            get: vi.fn(),
        } as any;

        const result = await route.handler(mockCtx);

        expect(result).toBeDefined();
        expect(result?.title).toBe('Gocals Instagram Feed');
        expect(result?.ttl).toBe(3 * 24 * 60); // 3 days in minutes
        expect(result?.item).toBeDefined();
        expect(result?.item).toHaveLength(4); // 4 accounts tracked
        expect(result?.item?.[0].title).toBe('Caption content');
        expect(result?.item?.[0].author).toBe('instagram');
    });
});
