import { BillingService } from '../modules/billing/service';

export async function runBillingJob(triggeredBy = 'cron', asOf?: Date): Promise<void> {
  console.log(`[BillingJob] Executing billing run: triggeredBy=${triggeredBy}, asOf=${asOf?.toISOString() || 'today'}`);
  try {
    const summary = await BillingService.runBilling(triggeredBy, asOf);
    console.log(`[BillingJob] Success: Run ID ${summary.runId}, Created: ${summary.created}, Skipped: ${summary.skipped}, Failed: ${summary.failed}`);
  } catch (err: any) {
    console.error(`[BillingJob] Billing run error:`, err.message);
  }
}

if (require.main === module) {
  runBillingJob('cli')
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
