
import { generateMonthlySummary } from '../app/actions/generate-monthly-summary';

async function testSummary() {
    console.log('Generating monthly summary...');
    const result = await generateMonthlySummary();
    if (result.success) {
        console.log('✅ Summary Generated Successfully:');
        console.log('-----------------------------------');
        console.log(result.summary);
        console.log('-----------------------------------');
    } else {
        console.error('❌ Error:', result.error);
    }
}

testSummary();
