'use server';

import { createClient } from '@/lib/auth/server';
import { getEmailProvider } from '@/lib/notifications/email-service';
import { getUnreconciledCount } from '@/app/actions/get-unreconciled-count';
import { getSalaryStatus } from '@/app/actions/salary';
import { startOfMonth, endOfMonth } from 'date-fns';

export async function sendReminders() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || user.email === 'undefined') {
        return { success: false, error: 'User not authenticated or no email' };
    }

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        return { success: false, error: 'No household' };
    }

    // 1. Gather Data
    // A. Pending Reviews
    const { count: pendingCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('household_id', profile.household_id)
        .or('status.eq.skipped,status.eq.pending');

    // B. Unreconciled P2P
    const unreconciledCount = await getUnreconciledCount();

    // C. Salary Check
    const salaryStatus = await getSalaryStatus();

    // 2. Compose Email
    const updates = [];
    if (pendingCount && pendingCount > 0) {
        updates.push(`<li><strong>${pendingCount}</strong> transactions need review.</li>`);
    }
    if (unreconciledCount > 0) {
        updates.push(`<li><strong>${unreconciledCount}</strong> Bit/Paybox transfers can be reconciled.</li>`);
    }
    if (salaryStatus.total === 0) {
        updates.push(`<li><strong>Salary</strong> for this month hasn't been recorded yet.</li>`);
    }

    if (updates.length === 0) {
        return { success: true, message: 'No reminders needed! You are all caught up.' };
    }

    const emailHtml = `
    <div style="font-family: sans-serif; color: #333;">
        <h1>Hi there,</h1>
        <p>Here is your financial update for ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}:</p>
        <ul>
            ${updates.join('')}
        </ul>
        <p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard" style="background-color: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                Go to Dashboard
            </a>
        </p>
    </div>
    `;

    // 3. Send
    const emailProvider = getEmailProvider();
    await emailProvider.send({
        to: user.email!,
        subject: `Monthly Finance Update: ${updates.length} items need attention`,
        html: emailHtml,
        text: `You have ${updates.length} items needing attention. Please verify on the dashboard.`
    });

    return { success: true, sentTo: user.email, items: updates.length };
}
