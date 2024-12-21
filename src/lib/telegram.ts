export async function sendTelegramAlert(message: string): Promise<void> {
    try {
        await fetch('/api/telegram', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message })
        });
    } catch (error) {
        console.error('Failed to send Telegram message:', error);
    }
} 