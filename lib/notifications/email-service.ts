export type EmailData = {
    to: string;
    subject: string;
    html: string;
    text?: string;
};

export interface EmailProvider {
    send(data: EmailData): Promise<void>;
}

export class MockEmailProvider implements EmailProvider {
    async send(data: EmailData): Promise<void> {
        console.log('--- [MOCK EMAIL SENT] ---');
        console.log(`To: ${data.to}`);
        console.log(`Subject: ${data.subject}`);
        console.log('--- Body ---');
        console.log(data.text || data.html); // Simple log
        console.log('-------------------------');
        return Promise.resolve();
    }
}

import { Resend } from 'resend';

// ...

export class ResendEmailProvider implements EmailProvider {
    private apiKey: string;
    private client: Resend;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.client = new Resend(apiKey);
    }

    async send(data: EmailData): Promise<void> {
        console.log('[Resend Provider] Sending email via API to:', data.to);

        try {
            await this.client.emails.send({
                from: 'Orbital Nadir <onboarding@resend.dev>', // Default Resend Testing Domain
                to: data.to,
                subject: data.subject,
                html: data.html,
                text: data.text
            });
            console.log('[Resend Provider] Email sent successfully');
        } catch (error) {
            console.error('[Resend Provider] Error sending email:', error);
            throw error;
        }
    }
}

// Factory to get the configured provider
export function getEmailProvider(): EmailProvider {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
        return new ResendEmailProvider(apiKey);
    }
    return new MockEmailProvider();
}
