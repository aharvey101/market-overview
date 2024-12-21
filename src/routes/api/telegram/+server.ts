import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    const { message } = await request.json();

    try {
        const url = `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: env.TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
        return json({ success: true });
    } catch (error) {
        console.error('Failed to send Telegram message:', error);
        return json({ success: false, error: 'Failed to send message' }, { status: 500 });
    }
}; 