import { CookieJar } from 'tough-cookie';

import { config } from '@/config';
import type { Data, DataItem, Route } from '@/types';
import cache from '@/utils/cache';
import logger from '@/utils/logger';

import { renderItems } from '../common-utils';
import { checkLogin, COOKIE_URL, getUserFeedItems, getUserInfo, renderGuestItems } from '../web-api/utils';

// Edit this list to specify the public Instagram accounts Gocals should track.
const ACCOUNTS = ['goacashewfest', 'goa.events', 'futurewealthgoa', 'thearungoa'];

export const route: Route = {
    path: '/gocals',
    categories: ['social-media'],
    example: '/instagram/gocals',
    features: {
        requireConfig: [
            {
                name: 'INSTAGRAM_COOKIE',
                optional: true,
                description: 'Instagram session cookie to bypass rate-limiting and login requirements',
            },
        ],
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Gocals Aggregated Profile Feed',
    maintainers: ['arbaznova'],
    handler,
};

async function handler(): Promise<Data> {
    const cacheKey = 'instagram:gocals:aggregated';
    const cacheTTL = 3 * 24 * 60 * 60; // 3 days in seconds

    return (await cache.tryGet(
        cacheKey,
        async () => {
            const cookie = config.instagram?.cookie;
            const cookieJarCached = await cache.get('instagram:cookieJar');
            const cacheMiss = !cookieJarCached;
            let cookieJar: CookieJar;

            if (cacheMiss) {
                cookieJar = new CookieJar();
                if (cookie) {
                    for await (const c of cookie.split('; ')) {
                        await cookieJar.setCookie(c, COOKIE_URL);
                    }
                }
            } else {
                cookieJar = CookieJar.fromJSON(cookieJarCached as string);
            }

            if (cookie && !(await checkLogin(cookieJar))) {
                throw new Error('Invalid Instagram cookie');
            }

            if (cacheMiss && cookie) {
                await cache.set('instagram:cookieJar', cookieJar.toJSON(), 31_536_000);
            }

            // Fetch profiles in parallel using Promise.all
            const itemsPromises = ACCOUNTS.map(async (username) => {
                try {
                    const userInfo = await getUserInfo(username, cookieJar);
                    if (!userInfo) {
                        return [];
                    }
                    const id = userInfo.id;
                    const rawItems = cookie ? await getUserFeedItems(id, username, cookieJar) : [...(userInfo.edge_felix_video_timeline?.edges || []), ...(userInfo.edge_owner_to_timeline_media?.edges || [])];

                    const items: DataItem[] = cookie ? renderItems(rawItems) : renderGuestItems(rawItems);
                    return items;
                } catch (error) {
                    logger.error(`Error fetching Instagram feed for ${username}: ${error}`);
                    return [];
                }
            });

            const allItemsResults = await Promise.all(itemsPromises);
            const mergedItems = allItemsResults.flat();

            // Sort items by pubDate descending
            mergedItems.sort((a, b) => {
                const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
                const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
                return dateB - dateA;
            });

            return {
                title: 'Gocals Instagram Feed',
                link: 'https://www.instagram.com',
                description: `Aggregated public Instagram pages for Gocals: ${ACCOUNTS.join(', ')}`,
                item: mergedItems,
                ttl: 3 * 24 * 60, // 3 days in minutes (RSS standard)
                allowEmpty: true,
            };
        },
        cacheTTL,
        false
    )) as Data;
}
