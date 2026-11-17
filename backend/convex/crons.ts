import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons=cronJobs();
// Airtable owns historical P&L and shared operating costs.
// If AIRTABLE_SYNC_TOKEN is absent, this job cannot sync until configured.
crons.interval("Refresh Airtable historical events", {minutes:30}, internal.airtableSync.refresh);
export default crons;
